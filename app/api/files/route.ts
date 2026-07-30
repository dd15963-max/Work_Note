import { database, ensureSchema } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import {
  applyOrganizedPlacement,
  cleanupManagedFolderChain,
  ensureManagedAttachmentFolders,
  loadWorkNoteDataset,
  logDriveOperation,
  ownerContextForAttachment,
  type DriveAttachmentRow,
} from "@/app/google-drive/managed-folders";
import { buildDrivePath, driveFileUrl, driveFolderUrl, resolveAttachmentOwnerContext } from "@/app/google-drive/organization";
import { getDriveFileMetadata, trashDriveFile } from "@/app/google-drive/files";
import { getSiteUser } from "@/app/site-user";
import { storageProvider, type StoredFileReference } from "@/app/storage/provider";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "jar"]);

type AttachmentRow = DriveAttachmentRow & {
  storage_key: string;
  extension: string;
  file_size: string;
  sha256: string | null;
  upload_status: string;
  preview_available: number;
  sync_status: string;
  last_synced_at: string;
  last_error: string;
};

function jsonError(message: string, status = 500, code = "REQUEST_FAILED") {
  return Response.json({ error: message, code }, { status });
}

async function currentUserEmail(): Promise<string | null> {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || null;
}

function cleanName(value: string): string {
  const base = value.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[\u0000-\u001f<>:"|?*]+/g, "_").trim().slice(0, 220) || "attachment";
}

function extensionOf(fileName: string): string {
  const value = fileName.split(".").pop()?.toLowerCase() || "";
  return value === fileName.toLowerCase() ? "" : value.slice(0, 20);
}

function previewAvailable(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf" || /\.(png|jpe?g|gif|webp|bmp|pdf)$/i.test(fileName);
}

function parseMetadata(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function fileReference(row: AttachmentRow): StoredFileReference {
  return {
    provider: row.storage_provider === "google_drive" ? "google_drive" : "site_storage",
    storageKey: row.storage_key,
    driveFileId: row.drive_file_id || undefined,
    driveFolderId: row.drive_category_folder_id || row.drive_folder_id || undefined,
    fileName: row.display_file_name || row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
  };
}

async function findAttachment(email: string, id: string): Promise<AttachmentRow | null> {
  return database().prepare(`SELECT storage_key, storage_provider, drive_file_id,
    drive_folder_id, drive_company_folder_id, drive_memo_folder_id,
    drive_category_folder_id, drive_path, drive_web_view_link, file_category,
    file_name, display_file_name, mime_type, extension, file_size, sha256,
    upload_status, preview_available, metadata_json, sync_status, last_synced_at,
    last_error, owner_kind, owner_local_id, local_id, created_at, updated_at
    FROM work_note_attachments
    WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
    .bind(email, id).first<AttachmentRow>();
}

function responseMetadata(id: string, row: AttachmentRow) {
  const metadata = parseMetadata(row.metadata_json);
  const driveId = row.drive_file_id || "";
  const memoFolderId = row.drive_memo_folder_id || "";
  return {
    ...metadata,
    id,
    fileName: row.display_file_name || row.file_name,
    originalFileName: row.file_name,
    fileType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    extension: row.extension,
    sha256: row.sha256 || "",
    storageProvider: row.storage_provider || "site_storage",
    driveFileId: driveId,
    driveFolderId: row.drive_category_folder_id || row.drive_folder_id || "",
    driveCompanyFolderId: row.drive_company_folder_id || "",
    driveMemoFolderId: memoFolderId,
    driveCategoryFolderId: row.drive_category_folder_id || "",
    drivePath: row.drive_path || "",
    driveWebViewLink: row.drive_web_view_link || driveFileUrl(driveId),
    driveMemoFolderUrl: driveFolderUrl(memoFolderId),
    category: row.file_category || String(metadata.category || "기타"),
    uploadStatus: row.upload_status,
    syncStatus: row.sync_status || "동기화 완료",
    lastSyncedAt: row.last_synced_at || row.updated_at,
    uploadError: row.last_error || "",
    previewAvailable: Boolean(row.preview_available),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!id) return jsonError("첨부파일 ID가 필요합니다.", 400);
    const row = await findAttachment(email, id);
    if (!row) return jsonError("첨부파일을 찾을 수 없습니다.", 404, "FILE_NOT_FOUND");
    if (url.searchParams.get("metadata") === "1") {
      return Response.json(responseMetadata(id, row));
    }
    const source = await storageProvider(row.storage_provider).downloadFile(email, fileReference(row));
    const disposition = url.searchParams.get("preview") === "1" ? "inline" : "attachment";
    const headers = new Headers(source.headers);
    headers.set("Content-Type", row.mime_type || "application/octet-stream");
    headers.set("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(row.display_file_name || row.file_name)}`);
    headers.set("Cache-Control", "private, no-store");
    return new Response(source.body, { status: source.status, headers });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function PUT(request: Request) {
  let uploadedDriveFileId = "";
  let replacingExistingDriveFile = false;
  let email = "";
  let id = "";
  let createdFolderIds: string[] = [];
  try {
    email = await currentUserEmail() || "";
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    if (!await getDriveConnection(email)) {
      return jsonError("Google Drive 연결이 필요합니다.", 409, "DRIVE_NOT_CONNECTED");
    }
    const form = await request.formData();
    id = String(form.get("id") || "").slice(0, 180);
    const file = form.get("file");
    if (!id || !(file instanceof File)) return jsonError("첨부파일 ID와 원본 파일이 필요합니다.", 400);
    if (file.size > MAX_FILE_SIZE) return jsonError("파일은 500MB 이하만 업로드할 수 있습니다.", 413, "FILE_TOO_LARGE");

    let metadata: Record<string, unknown>;
    try { metadata = JSON.parse(String(form.get("metadata") || "{}")) as Record<string, unknown>; }
    catch { return jsonError("첨부파일 정보 형식이 올바르지 않습니다.", 400); }
    const originalName = cleanName(String(metadata.fileName || metadata.name || file.name || "attachment"));
    const extension = extensionOf(originalName);
    if (BLOCKED_EXTENSIONS.has(extension)) {
      return jsonError(`보안상 .${extension} 파일은 업로드할 수 없습니다.`, 415, "BLOCKED_FILE_TYPE");
    }
    const mimeType = String(metadata.fileType || file.type || "application/octet-stream");
    const ownerKind = String(metadata.ownerType || metadata.backupOwnerType || "unknown").slice(0, 80);
    const ownerLocalId = String(metadata.ownerId || metadata.noteId || metadata.backupOwnerId || "").slice(0, 180);
    const uploadedAt = String(metadata.uploadedAt || new Date().toISOString());
    const existingRow = await findAttachment(email, id);
    replacingExistingDriveFile = existingRow?.storage_provider === "google_drive" && Boolean(existingRow.drive_file_id);
    const dataset = await loadWorkNoteDataset(email);
    const context = resolveAttachmentOwnerContext({
      dataset,
      ownerKind,
      ownerLocalId,
      metadata,
      fileName: originalName,
      mimeType,
      category: metadata.category,
      uploadedAt,
    });
    const operationToken = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await database().prepare(`INSERT INTO work_note_attachments
      (user_email, local_id, owner_kind, owner_local_id, storage_key,
        storage_provider, drive_file_id, drive_folder_id, file_name,
        display_file_name, mime_type, extension, file_size, sha256,
        upload_status, preview_available, uploaded_by, metadata_json,
        migration_json, created_at, updated_at, deleted_at, sync_status,
        last_synced_at, last_error, operation_token)
      VALUES (?, ?, ?, ?, '', 'google_drive', ?, ?, ?, ?, ?, ?, ?, ?,
        'uploading', ?, ?, ?, '{}', ?, ?, NULL, '업로드 중', '', '', ?)
      ON CONFLICT(user_email, local_id) DO UPDATE SET
        owner_kind = excluded.owner_kind, owner_local_id = excluded.owner_local_id,
        file_name = excluded.file_name, display_file_name = excluded.display_file_name,
        mime_type = excluded.mime_type, extension = excluded.extension,
        file_size = excluded.file_size, sha256 = excluded.sha256,
        upload_status = 'uploading', sync_status = '업로드 중',
        metadata_json = excluded.metadata_json, operation_token = excluded.operation_token,
        updated_at = excluded.updated_at, deleted_at = NULL`)
      .bind(
        email, id, ownerKind, ownerLocalId,
        existingRow?.drive_file_id || null, existingRow?.drive_folder_id || null,
        originalName, originalName, mimeType, extension, String(file.size),
        String(metadata.sha256 || "") || null, previewAvailable(mimeType, originalName) ? 1 : 0,
        email, JSON.stringify({ ...metadata, category: context.category }), uploadedAt,
        startedAt, operationToken,
      ).run();
    const folders = await ensureManagedAttachmentFolders(email, context);
    createdFolderIds = [folders.categoryFolderId, folders.memoFolderId, folders.companyFolderId];
    const stored = await storageProvider("google_drive").uploadFile({
      userEmail: email,
      fileName: originalName,
      mimeType,
      fileSize: file.size,
      body: file.stream(),
      folderId: folders.categoryFolderId,
      existing: existingRow ? fileReference(existingRow) : null,
    });
    uploadedDriveFileId = stored.driveFileId || "";
    const webViewLink = stored.metadata?.webViewLink || driveFileUrl(uploadedDriveFileId);
    const now = new Date().toISOString();
    const safeMetadata: Record<string, unknown> = {
      ...metadata,
      storageProvider: "google_drive",
      driveFileId: uploadedDriveFileId,
      driveFolderId: folders.categoryFolderId,
      driveCompanyFolderId: folders.companyFolderId,
      driveMemoFolderId: folders.memoFolderId,
      driveCategoryFolderId: folders.categoryFolderId,
      drivePath: buildDrivePath(context, originalName),
      driveWebViewLink: webViewLink,
      driveMemoFolderUrl: folders.memoFolderUrl,
      category: context.category,
      uploadStatus: "completed",
      syncStatus: "동기화 완료",
      lastSyncedAt: now,
      previewAvailable: stored.previewAvailable,
    };
    delete safeMetadata.blob;
    await database().prepare(`UPDATE work_note_attachments SET
      storage_provider = 'google_drive', drive_file_id = ?, drive_folder_id = ?,
      drive_company_folder_id = ?, drive_memo_folder_id = ?,
      drive_category_folder_id = ?, drive_path = ?, drive_web_view_link = ?,
      file_category = ?, upload_status = 'completed', preview_available = ?,
      metadata_json = ?, sync_status = '동기화 완료', last_synced_at = ?,
      last_error = '', operation_token = '', updated_at = ?
      WHERE user_email = ? AND local_id = ?`)
      .bind(
        uploadedDriveFileId, folders.categoryFolderId, folders.companyFolderId,
        folders.memoFolderId, folders.categoryFolderId,
        buildDrivePath(context, originalName), webViewLink, context.category,
        stored.previewAvailable ? 1 : 0, JSON.stringify(safeMetadata), now, now, email, id,
      ).run();
    const finalRow = await findAttachment(email, id);
    if (!finalRow) throw new Error("업로드된 첨부파일 정보를 저장하지 못했습니다.");
    if (existingRow) {
      await cleanupManagedFolderChain(email, [
        existingRow.drive_category_folder_id || existingRow.drive_folder_id || "",
        existingRow.drive_memo_folder_id || "",
        existingRow.drive_company_folder_id || "",
      ]);
    }
    await logDriveOperation(email, {
      operationType: replacingExistingDriveFile ? "file_replace" : "file_upload",
      targetId: uploadedDriveFileId,
      beforePath: existingRow?.drive_path || "",
      afterPath: finalRow.drive_path || "",
      status: "completed",
      payload: { memoId: ownerLocalId, category: context.category },
    });
    return Response.json({ ok: true, ...responseMetadata(id, finalRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (uploadedDriveFileId && !replacingExistingDriveFile && email) {
      try { await trashDriveFile(email, uploadedDriveFileId); }
      catch (cleanupError) {
        try {
          await database().prepare(`INSERT INTO work_note_file_recovery
            (id, user_email, local_id, drive_file_id, issue_type, payload, created_at, resolved_at)
            VALUES (?, ?, ?, ?, 'orphan_after_db_failure', ?, ?, NULL)`)
            .bind(
              crypto.randomUUID(), email, id, uploadedDriveFileId,
              JSON.stringify({ error: message, cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }),
              new Date().toISOString(),
            ).run();
        } catch { /* Preserve the original error. */ }
      }
    }
    if (email && id) {
      try {
        await database().prepare(`UPDATE work_note_attachments SET
          upload_status = 'failed', sync_status = '재시도 필요',
          last_error = ?, operation_token = '', updated_at = ?
          WHERE user_email = ? AND local_id = ?`)
          .bind(message, new Date().toISOString(), email, id).run();
        if (createdFolderIds.length) await cleanupManagedFolderChain(email, createdFolderIds);
        await logDriveOperation(email, {
          operationType: "file_upload",
          targetId: uploadedDriveFileId || id,
          status: "retry_required",
          errorMessage: message,
        });
      } catch { /* Keep upload error. */ }
    }
    return jsonError(message);
  }
}

export async function PATCH(request: Request) {
  let email = "";
  let id = "";
  try {
    email = await currentUserEmail() || "";
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    const payload = await request.json() as {
      id?: string;
      fileName?: string;
      ownerKind?: string;
      ownerLocalId?: string;
      companyName?: string;
      companyId?: string;
      memoTitle?: string;
      category?: string;
      sentDate?: string;
      memo?: string;
    };
    id = String(payload.id || "");
    const row = await findAttachment(email, id);
    if (!row) return jsonError("첨부파일을 찾을 수 없습니다.", 404, "FILE_NOT_FOUND");
    const now = new Date().toISOString();
    await database().prepare(`UPDATE work_note_attachments SET sync_status = '이동 중',
      upload_status = 'moving', operation_token = ?, updated_at = ?
      WHERE user_email = ? AND local_id = ?`)
      .bind(crypto.randomUUID(), now, email, id).run();
    let reference = fileReference(row);
    const nextName = payload.fileName ? cleanName(payload.fileName) : reference.fileName;
    if (nextName !== reference.fileName) {
      reference = await storageProvider(row.storage_provider).renameFile(email, reference, nextName);
    }
    const currentMetadata = parseMetadata(row.metadata_json);
    const ownerKind = String(payload.ownerKind || row.owner_kind || currentMetadata.ownerType || "unknown");
    const ownerLocalId = String(payload.ownerLocalId || row.owner_local_id || currentMetadata.ownerId || "");
    const nextMetadata = {
      ...currentMetadata,
      ...(payload.fileName ? { fileName: nextName, name: nextName } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {}),
      ...(payload.sentDate !== undefined ? { sentDate: payload.sentDate } : {}),
      ...(payload.memo !== undefined ? { memo: payload.memo } : {}),
      ...(payload.companyName !== undefined ? { companyName: payload.companyName } : {}),
      ...(payload.companyId !== undefined ? { companyId: payload.companyId } : {}),
      ...(payload.memoTitle !== undefined ? { memoTitle: payload.memoTitle } : {}),
      ownerType: ownerKind,
      ownerId: ownerLocalId,
    };
    await database().prepare(`UPDATE work_note_attachments SET display_file_name = ?,
      owner_kind = ?, owner_local_id = ?, metadata_json = ?, updated_at = ?
      WHERE user_email = ? AND local_id = ?`)
      .bind(nextName, ownerKind, ownerLocalId, JSON.stringify(nextMetadata), now, email, id).run();
    const workingRow = { ...row, display_file_name: nextName, owner_kind: ownerKind,
      owner_local_id: ownerLocalId, metadata_json: JSON.stringify(nextMetadata) };
    if (row.storage_provider === "google_drive" && row.drive_file_id) {
      const dataset = await loadWorkNoteDataset(email);
      const context = ownerContextForAttachment(dataset, workingRow, {
        ...nextMetadata,
        category: payload.category ?? row.file_category,
        ownerKind,
        ownerLocalId,
        fileName: nextName,
      });
      await applyOrganizedPlacement({ userEmail: email, row: workingRow, context });
    } else {
      await database().prepare(`UPDATE work_note_attachments SET
        upload_status = 'completed', sync_status = '동기화 완료',
        last_synced_at = ?, last_error = '', operation_token = '', updated_at = ?
        WHERE user_email = ? AND local_id = ?`).bind(now, now, email, id).run();
    }
    const finalRow = await findAttachment(email, id);
    if (!finalRow) throw new Error("첨부파일 정보를 갱신하지 못했습니다.");
    return Response.json({ ok: true, ...responseMetadata(id, finalRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (email && id) {
      try {
        await database().prepare(`UPDATE work_note_attachments SET upload_status = 'failed',
          sync_status = '재시도 필요', last_error = ?, operation_token = '',
          updated_at = ? WHERE user_email = ? AND local_id = ?`)
          .bind(message, new Date().toISOString(), email, id).run();
      } catch { /* Preserve original error. */ }
    }
    return jsonError(message);
  }
}

export async function DELETE(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const mode = url.searchParams.get("mode") === "unlink" ? "unlink" : "trash";
    if (!id) return jsonError("첨부파일 ID가 필요합니다.", 400);
    const row = await findAttachment(email, id);
    if (row && mode === "trash") {
      await storageProvider(row.storage_provider).deleteFile(email, fileReference(row));
    }
    const now = new Date().toISOString();
    await database().prepare(`UPDATE work_note_attachments SET upload_status = 'deleted',
      sync_status = '동기화 완료', deleted_at = ?, last_synced_at = ?,
      updated_at = ? WHERE user_email = ? AND local_id = ?`)
      .bind(now, now, now, email, id).run();
    if (row) {
      await logDriveOperation(email, {
        operationType: mode === "trash" ? "file_trash" : "file_unlink",
        targetId: row.drive_file_id || id,
        beforePath: row.drive_path || "",
        status: "completed",
      });
      await cleanupManagedFolderChain(email, [
        row.drive_category_folder_id || row.drive_folder_id || "",
        row.drive_memo_folder_id || "",
        row.drive_company_folder_id || "",
      ]);
    }
    return Response.json({ ok: true, mode });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
