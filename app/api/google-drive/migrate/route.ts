import { database, ensureSchema, fileBucket } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import { decryptSecret, encryptSecret } from "@/app/google-drive/crypto";
import {
  createDriveResumableSession,
  findDriveFilesForAttachment,
  queryDriveResumableStatus,
  updateDriveFileMetadata,
  uploadDriveResumableChunk,
  type DriveFileMetadata,
} from "@/app/google-drive/files";
import {
  acquireDriveFolderPlacementLock,
  acquireDriveOperationLock,
  ensureManagedAttachmentFolders,
  loadWorkNoteDataset,
  logDriveOperation,
  previewAttachmentOrganization,
  releaseDriveFolderPlacementLock,
  releaseDriveOperationLock,
  renewDriveOperationLock,
  type DriveFolderPlacementLease,
} from "@/app/google-drive/managed-folders";
import { buildDrivePath, driveFileUrl, resolveAttachmentOwnerContext } from "@/app/google-drive/organization";
import { DRIVE_UPLOAD_CHUNK_SIZE, byteRangeForOffset } from "@/app/google-drive/resumable-protocol";
import { decideDriveFileAdoption } from "@/app/google-drive/upload-adoption";
import {
  UploadProtocolError,
  classifyUploadError,
  safeUploadLog,
} from "@/app/google-drive/upload-errors";
import { getSiteUser } from "@/app/site-user";

type LegacyRow = {
  local_id: string;
  owner_kind: string;
  owner_local_id: string;
  storage_key: string;
  file_name: string;
  display_file_name: string;
  mime_type: string;
  file_size: string;
  metadata_json: string;
  created_at: string;
};

type MigrationSession = {
  id: string;
  operation_token: string;
  source_key: string;
  encrypted_drive_session_uri: string;
  destination_folder_id: string;
  company_folder_id: string;
  memo_folder_id: string;
  confirmed_bytes: number;
  total_bytes: number;
  chunk_size: number;
  retry_count: number;
  metadata_json: string;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function parseMetadata(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

async function userEmail() {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || "";
}

async function remainingLegacy(email: string): Promise<number> {
  const row = await database().prepare(`SELECT COUNT(*) AS count FROM work_note_attachments
    WHERE user_email = ? AND storage_provider = 'site_storage' AND deleted_at IS NULL`)
    .bind(email).first<{ count: number }>();
  return Number(row?.count || 0);
}

async function migrationSession(email: string, attachmentId: string): Promise<MigrationSession | null> {
  return database().prepare(`SELECT id, operation_token, source_key,
    encrypted_drive_session_uri, destination_folder_id, company_folder_id,
    memo_folder_id, confirmed_bytes, total_bytes, chunk_size, retry_count,
    metadata_json FROM work_note_upload_sessions
    WHERE user_email = ? AND attachment_id = ? AND source_status = 'available'
    ORDER BY updated_at DESC LIMIT 1`).bind(email, attachmentId).first<MigrationSession>();
}

async function ensureMigrationSession(email: string, row: LegacyRow): Promise<MigrationSession> {
  const current = await migrationSession(email, row.local_id);
  if (current) return current;
  const object = await fileBucket().head(row.storage_key);
  const totalBytes = Number(row.file_size || 0);
  if (!object || object.size !== totalBytes) throw new Error("기존 R2 원본 파일을 찾을 수 없습니다.");
  const id = crypto.randomUUID();
  const operationToken = `migration:${row.local_id}`;
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO work_note_upload_sessions
    (id, user_email, attachment_id, operation_token, source_key, r2_upload_id,
      encrypted_drive_session_uri, drive_session_created_at, existing_drive_file_id,
      drive_file_id, destination_folder_id, company_folder_id, memo_folder_id,
      drive_path, file_name, mime_type, total_bytes, chunk_size,
      source_uploaded_bytes, confirmed_bytes, current_chunk, status, source_status,
      metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', '', '', '', '', '', '', '', '', ?, ?, ?, ?,
      ?, 0, 0, 'pending', 'available', ?, ?, ?)
    ON CONFLICT(user_email, operation_token) DO NOTHING`)
    .bind(id, email, row.local_id, operationToken, row.storage_key,
      row.display_file_name || row.file_name, row.mime_type, totalBytes,
      DRIVE_UPLOAD_CHUNK_SIZE, totalBytes, row.metadata_json, now, now).run();
  const created = await migrationSession(email, row.local_id);
  if (!created) throw new Error("Drive 이전 작업을 만들지 못했습니다.");
  await database().prepare(`UPDATE work_note_attachments SET upload_session_id = ?,
    source_status = 'available', source_storage_key = ?, total_bytes = ?,
    processed_bytes = 0, current_chunk = 0, upload_status = 'pending',
    sync_status = 'pending', updated_at = ? WHERE user_email = ? AND local_id = ?`)
    .bind(created.id, row.storage_key, totalBytes, now, email, row.local_id).run();
  return created;
}

async function completedMigrationFile(
  email: string,
  row: LegacyRow,
  session: MigrationSession,
  destinationFolderId: string,
): Promise<DriveFileMetadata | null> {
  const candidates = await findDriveFilesForAttachment(email, row.local_id, {
    operationToken: session.operation_token,
  });
  const decision = decideDriveFileAdoption(candidates, {
    attachmentId: row.local_id,
    operationToken: session.operation_token,
    totalBytes: Number(row.file_size || 0),
  });
  if (decision.kind === "create") return null;
  if (decision.kind === "duplicate") {
    throw new UploadProtocolError(
      "DUPLICATE_OPERATION",
      "같은 이전 작업으로 생성된 Drive 파일이 여러 개이거나 크기가 일치하지 않습니다.",
      { stage: "migration_adopt", status: 409, retryable: false },
    );
  }
  if ((decision.file.parents || []).includes(destinationFolderId)) return decision.file;
  const previousParents = (decision.file.parents || [])
    .filter((parentId) => parentId !== destinationFolderId);
  const moved = await updateDriveFileMetadata(email, decision.file.id, {
    addParent: destinationFolderId,
    removeParent: previousParents.length ? previousParents.join(",") : undefined,
  });
  if (!(moved.parents || []).includes(destinationFolderId)) {
    throw new UploadProtocolError("DRIVE_FOLDER_NOT_FOUND", "완료 파일을 표준 폴더로 이동하지 못했습니다.", {
      stage: "migration_adopt_move",
      status: 409,
      retryable: true,
    });
  }
  return moved;
}

async function finalizeMigration(
  email: string,
  row: LegacyRow,
  session: MigrationSession,
  driveFile: DriveFileMetadata,
  context: ReturnType<typeof resolveAttachmentOwnerContext>,
  folders: Awaited<ReturnType<typeof ensureManagedAttachmentFolders>>,
  adopted: boolean,
) {
  const totalBytes = Number(row.file_size || 0);
  if (!driveFile.id || Number(driveFile.size || 0) !== totalBytes) {
    throw new Error("이전 후 파일 크기가 일치하지 않습니다.");
  }
  const now = new Date().toISOString();
  const drivePath = buildDrivePath(context, row.display_file_name || row.file_name);
  const previous = parseMetadata(row.metadata_json);
  const nextMetadata = {
    ...previous,
    storageProvider: "google_drive",
    driveFileId: driveFile.id,
    driveFolderId: folders.categoryFolderId,
    driveCompanyFolderId: folders.companyFolderId,
    driveMemoFolderId: folders.memoFolderId,
    driveCategoryFolderId: folders.categoryFolderId,
    drivePath,
    driveWebViewLink: driveFile.webViewLink || driveFileUrl(driveFile.id),
    driveMemoFolderUrl: folders.memoFolderUrl,
    category: context.category,
    syncStatus: "synced",
    lastSyncedAt: now,
    sourceStatus: "available",
  };
  await database().batch([
    database().prepare(`UPDATE work_note_attachments SET
      storage_provider = 'google_drive', drive_file_id = ?, drive_folder_id = ?,
      drive_company_folder_id = ?, drive_memo_folder_id = ?,
      drive_category_folder_id = ?, drive_path = ?, drive_web_view_link = ?,
      file_category = ?, upload_status = 'completed', sync_status = 'synced',
      last_synced_at = ?, last_error = '', sync_error_code = '',
      sync_error_message = '', sync_error_detail = '', failure_stage = '',
      auto_recoverable = 0, user_action_required = 0, processed_bytes = ?,
      total_bytes = ?, current_chunk = ?, source_status = 'available',
      source_storage_key = ?, last_retry_result = '성공',
      metadata_json = ?, migration_json = ?, updated_at = ?
      WHERE user_email = ? AND local_id = ? AND storage_provider = 'site_storage'`)
      .bind(driveFile.id, folders.categoryFolderId, folders.companyFolderId,
        folders.memoFolderId, folders.categoryFolderId, drivePath,
        driveFile.webViewLink || driveFileUrl(driveFile.id), context.category,
        now, totalBytes, totalBytes, Math.ceil(totalBytes / DRIVE_UPLOAD_CHUNK_SIZE),
        row.storage_key, JSON.stringify(nextMetadata),
        JSON.stringify({ migratedAt: now, legacyStorageKey: row.storage_key, legacyRetained: true }),
        now, email, row.local_id),
    database().prepare(`UPDATE work_note_upload_sessions SET status = 'synced',
      drive_file_id = ?, confirmed_bytes = total_bytes, completed_at = ?,
      updated_at = ?, error_code = '', user_message = '', error_detail = '',
      failure_stage = '' WHERE user_email = ? AND id = ?`)
      .bind(driveFile.id, now, now, email, session.id),
  ]);
  await logDriveOperation(email, {
    operationType: adopted ? "migration_adopt" : "migration",
    targetId: driveFile.id,
    afterPath: drivePath,
    status: "completed",
    payload: {
      localId: row.local_id,
      uploadSessionId: session.id,
      processedBytes: totalBytes,
      legacyRetained: true,
      destinationFolderId: folders.categoryFolderId,
    },
  });
}

export async function GET(request: Request) {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  await ensureSchema();
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "1") {
    return Response.json(await previewAttachmentOrganization(email));
  }
  const organization = await previewAttachmentOrganization(email);
  return Response.json({
    legacyFileCount: await remainingLegacy(email),
    organizationMoveCount: organization.moveRequired,
  });
}

export async function POST(request: Request) {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  let activeRow: LegacyRow | null = null;
  let activeSession: MigrationSession | null = null;
  let placementLease: DriveFolderPlacementLease | null = null;
  let migrationLockKey = "";
  let migrationLockToken = "";
  const releasePlacement = async () => {
    if (!placementLease) return;
    const lease = placementLease;
    placementLease = null;
    await releaseDriveFolderPlacementLock(email, lease).catch(() => undefined);
  };
  try {
    await ensureSchema();
    if (!await getDriveConnection(email)) return jsonError("Google Drive 연결이 필요합니다.", 409);
    const payload = await request.json().catch(() => ({})) as { ids?: string[]; preview?: boolean };
    if (payload.preview) return Response.json(await previewAttachmentOrganization(email));
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String).filter(Boolean).slice(0, 25) : [];
    const query = ids.length
      ? `SELECT local_id, owner_kind, owner_local_id, storage_key, file_name,
          display_file_name, mime_type, file_size, metadata_json, created_at
        FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
          AND deleted_at IS NULL AND local_id IN (${ids.map(() => "?").join(",")})
        ORDER BY updated_at ASC LIMIT 1`
      : `SELECT local_id, owner_kind, owner_local_id, storage_key, file_name,
          display_file_name, mime_type, file_size, metadata_json, created_at
        FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
          AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT 1`;
    let row = await database().prepare(query).bind(email, ...ids).first<LegacyRow>();
    if (!row) return Response.json({ ok: true, migrated: 0, failed: 0, remaining: 0, inProgress: false });
    migrationLockKey = `migration-session:${row.local_id}`;
    migrationLockToken = await acquireDriveOperationLock(email, migrationLockKey);
    row = await database().prepare(`SELECT local_id, owner_kind, owner_local_id,
      storage_key, file_name, display_file_name, mime_type, file_size,
      metadata_json, created_at FROM work_note_attachments
      WHERE user_email = ? AND local_id = ? AND storage_provider = 'site_storage'
        AND deleted_at IS NULL`).bind(email, row.local_id).first<LegacyRow>();
    if (!row) {
      return Response.json({ ok: true, migrated: 0, failed: 0,
        remaining: await remainingLegacy(email), inProgress: false });
    }
    activeRow = row;

    let session = await ensureMigrationSession(email, row);
    activeSession = session;
    const dataset = await loadWorkNoteDataset(email);
    const metadata = parseMetadata(row.metadata_json);
    const context = resolveAttachmentOwnerContext({
      dataset,
      ownerKind: row.owner_kind,
      ownerLocalId: row.owner_local_id,
      metadata,
      fileName: row.display_file_name || row.file_name,
      mimeType: row.mime_type,
      category: metadata.category,
      uploadedAt: row.created_at,
    });
    placementLease = await acquireDriveFolderPlacementLock(email);
    const folders = await ensureManagedAttachmentFolders(email, context);
    const adopted = await completedMigrationFile(
      email,
      row,
      session,
      folders.categoryFolderId,
    );
    if (adopted) {
      await finalizeMigration(email, row, session, adopted, context, folders, true);
      await releasePlacement();
      return Response.json({ ok: true, migrated: 1, failed: 0,
        remaining: await remainingLegacy(email), inProgress: false, sessionId: session.id });
    }

    if (!session.encrypted_drive_session_uri) {
      const started = await createDriveResumableSession(email, {
        name: row.display_file_name || row.file_name,
        mimeType: row.mime_type,
        size: Number(row.file_size || 0),
        folderId: folders.categoryFolderId,
        appProperties: {
          managedBy: "work-note",
          attachmentId: row.local_id,
          operationToken: session.operation_token,
          memoId: context.memoId,
          companyId: context.companyId,
        },
      });
      const now = new Date().toISOString();
      await database().prepare(`UPDATE work_note_upload_sessions SET
        encrypted_drive_session_uri = ?, drive_session_created_at = ?,
        destination_folder_id = ?, company_folder_id = ?, memo_folder_id = ?,
        drive_path = ?, status = 'uploading', updated_at = ?
        WHERE user_email = ? AND id = ?`)
        .bind(await encryptSecret(started.sessionUri), started.createdAt,
          folders.categoryFolderId, folders.companyFolderId, folders.memoFolderId,
          buildDrivePath(context, row.display_file_name || row.file_name),
          now, email, session.id).run();
      session = (await migrationSession(email, row.local_id))!;
      activeSession = session;
    }

    await releasePlacement();
    const totalBytes = Number(session.total_bytes);
    const range = byteRangeForOffset(totalBytes, Number(session.confirmed_bytes || 0), Number(session.chunk_size));
    const source = await fileBucket().get(row.storage_key, {
      range: { offset: range.start, length: range.length },
    });
    if (!source?.body) throw new Error("기존 R2 원본 파일을 찾을 수 없습니다.");
    const sessionUri = await decryptSecret(session.encrypted_drive_session_uri);
    let result;
    try {
      await renewDriveOperationLock(email, migrationLockKey, migrationLockToken);
      result = await uploadDriveResumableChunk(
        email,
        sessionUri,
        {
          body: source.body,
          start: range.start,
          end: range.end,
          total: totalBytes,
          mimeType: row.mime_type,
        },
      );
    } catch (uploadError) {
      const failure = classifyUploadError(uploadError, "migration_chunk");
      if (failure.code === "UPLOAD_SESSION_EXPIRED") {
        const now = new Date().toISOString();
        await database().prepare(`UPDATE work_note_upload_sessions SET
          encrypted_drive_session_uri = '', drive_session_created_at = '',
          confirmed_bytes = 0, current_chunk = 0, status = 'retry_required',
          updated_at = ? WHERE user_email = ? AND id = ?`)
          .bind(now, email, session.id).run();
        return Response.json({ ok: true, migrated: 0, failed: 0,
          remaining: await remainingLegacy(email), inProgress: true,
          sessionId: session.id, processedBytes: 0, totalBytes });
      }
      if (failure.retryable) {
        const probe = await queryDriveResumableStatus(email, sessionUri, totalBytes);
        if (probe.complete && probe.metadata) {
          await finalizeMigration(email, row, session, probe.metadata, context, folders, false);
          return Response.json({ ok: true, migrated: 1, failed: 0,
            remaining: await remainingLegacy(email), inProgress: false,
            sessionId: session.id, processedBytes: totalBytes, totalBytes });
        }
        const now = new Date().toISOString();
        await database().prepare(`UPDATE work_note_upload_sessions SET confirmed_bytes = ?,
          current_chunk = CAST((? + chunk_size - 1) / chunk_size AS INTEGER),
          status = 'uploading', updated_at = ? WHERE user_email = ? AND id = ?`)
          .bind(probe.confirmedBytes, probe.confirmedBytes, now, email, session.id).run();
        return Response.json({ ok: true, migrated: 0, failed: 0,
          remaining: await remainingLegacy(email), inProgress: true,
          sessionId: session.id, processedBytes: probe.confirmedBytes, totalBytes });
      }
      throw uploadError;
    }
    await renewDriveOperationLock(email, migrationLockKey, migrationLockToken);
    if (result.complete && result.metadata) {
      await finalizeMigration(email, row, session, result.metadata, context, folders, false);
      return Response.json({ ok: true, migrated: 1, failed: 0,
        remaining: await remainingLegacy(email), inProgress: false, sessionId: session.id,
        processedBytes: totalBytes, totalBytes });
    }
    const now = new Date().toISOString();
    const nextUri = result.sessionUri ? await encryptSecret(result.sessionUri) : "";
    await database().batch([
      database().prepare(`UPDATE work_note_upload_sessions SET confirmed_bytes = ?,
        current_chunk = ?, status = 'uploading',
        encrypted_drive_session_uri = CASE WHEN ? = '' THEN encrypted_drive_session_uri ELSE ? END,
        updated_at = ? WHERE user_email = ? AND id = ?`)
        .bind(result.confirmedBytes, range.partNumber, nextUri, nextUri, now, email, session.id),
      database().prepare(`UPDATE work_note_attachments SET processed_bytes = ?,
        current_chunk = ?, upload_status = 'uploading', sync_status = 'uploading',
        source_status = 'available', source_storage_key = ?, updated_at = ?
        WHERE user_email = ? AND local_id = ?`)
        .bind(result.confirmedBytes, range.partNumber, row.storage_key, now, email, row.local_id),
    ]);
    return Response.json({
      ok: true,
      migrated: 0,
      failed: 0,
      remaining: await remainingLegacy(email),
      inProgress: true,
      sessionId: session.id,
      processedBytes: result.confirmedBytes,
      totalBytes,
    });
  } catch (error) {
    await releasePlacement();
    const failure = classifyUploadError(error, "migration_chunk");
    const now = new Date().toISOString();
    const status = ["DRIVE_RECONNECT_REQUIRED", "DRIVE_NOT_CONNECTED"].includes(failure.code)
      ? "reconnect_required"
      : failure.retryable || failure.autoRecoverable ? "retry_required" : "failed";
    const sourceRetained = Boolean(activeRow) && failure.code !== "R2_SOURCE_MISSING";
    if (activeSession) {
      try {
        await database().prepare(`UPDATE work_note_upload_sessions SET status = ?,
          error_code = ?, user_message = ?, error_detail = ?, failure_stage = ?,
          retry_count = retry_count + 1, last_retry_at = ?, auto_recoverable = ?,
          user_action_required = ?, updated_at = ? WHERE user_email = ? AND id = ?`)
          .bind(status, failure.code, failure.userMessage, failure.technicalDetail,
            failure.stage, now, failure.autoRecoverable ? 1 : 0,
            failure.userActionRequired ? 1 : 0, now, email, activeSession.id).run();
      } catch { /* Preserve the migration error. */ }
    }
    if (activeRow) {
      try {
        const sourceStatus = failure.code === "R2_SOURCE_MISSING" ? "missing" : "available";
        await database().prepare(`UPDATE work_note_attachments SET upload_status = ?,
          sync_status = ?, sync_error_code = ?, sync_error_message = ?,
          sync_error_detail = ?, failure_stage = ?, failed_at = ?,
          retry_count = retry_count + 1, last_retry_at = ?, last_retry_result = ?,
          auto_recoverable = ?, user_action_required = ?, last_error = ?,
          source_status = ?, source_storage_key = CASE WHEN source_storage_key = ''
            THEN storage_key ELSE source_storage_key END, updated_at = ?
          WHERE user_email = ? AND local_id = ?`)
          .bind(status, status, failure.code, failure.userMessage, failure.technicalDetail,
            failure.stage, now, now, `${failure.code}: ${failure.userMessage}`,
            failure.autoRecoverable ? 1 : 0, failure.userActionRequired ? 1 : 0,
            failure.userMessage, sourceStatus, now, email, activeRow.local_id).run();
      } catch { /* Preserve the migration error. */ }
      try {
        await logDriveOperation(email, {
          operationType: "migration",
          targetId: activeRow.local_id,
          status,
          errorMessage: failure.userMessage,
          payload: safeUploadLog(error, failure.stage, {
            localId: activeRow.local_id,
            uploadSessionId: activeSession?.id || "",
            sourceRetained,
          }),
        });
      } catch { /* Preserve the migration error. */ }
    }
    const remaining = await remainingLegacy(email).catch(() => -1);
    return Response.json({
      ok: false,
      migrated: 0,
      failed: 1,
      remaining,
      inProgress: false,
      sessionId: activeSession?.id || "",
      sourceRetained,
      error: failure.userMessage,
      errorCode: failure.code,
    }, { status: failure.httpStatus });
  } finally {
    await releasePlacement();
    if (migrationLockKey && migrationLockToken) {
      await releaseDriveOperationLock(email, migrationLockKey, migrationLockToken)
        .catch(() => undefined);
    }
  }
}
