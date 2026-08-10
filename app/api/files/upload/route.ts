import { database, ensureSchema, fileBucket } from "@/db/runtime";
import {
  accessTokenForUser,
  getDriveConnection,
  invalidateDriveAccessToken,
} from "@/app/google-drive/auth";
import { decryptSecret, encryptSecret } from "@/app/google-drive/crypto";
import {
  createDriveResumableSession,
  ensureDriveFileParent,
  findDriveFilesForAttachment,
  queryDriveResumableStatus,
  updateDriveFileMetadata,
  uploadDriveResumableChunk,
  type DriveFileMetadata,
} from "@/app/google-drive/files";
import {
  acquireDriveFolderPlacementLock,
  ensureManagedAttachmentFolders,
  loadWorkNoteDataset,
  logDriveOperation,
  releaseDriveFolderPlacementLock,
  type DriveFolderPlacementLease,
} from "@/app/google-drive/managed-folders";
import {
  buildDrivePath,
  driveFileUrl,
  resolveAttachmentOwnerContext,
  type AttachmentOwnerContext,
} from "@/app/google-drive/organization";
import { recoverExpiredSourceMultipart } from "@/app/google-drive/source-upload-recovery";
import { recoverDriveNextFailure } from "@/app/google-drive/upload-recovery-executor";
import {
  DRIVE_UPLOAD_CHUNK_SIZE,
  byteRangeForOffset,
  parseContentRange,
  retryDelayMs,
  uploadProgressPercent,
} from "@/app/google-drive/resumable-protocol";
import {
  UploadProtocolError,
  classifyUploadError,
  uploadErrorResponse,
} from "@/app/google-drive/upload-errors";
import { decideDriveFileAdoption } from "@/app/google-drive/upload-adoption";
import { getSiteUser } from "@/app/site-user";
import { sanitizeBoundaryRecord } from "@/react-work-note/src/fullstack/boundarySanitizer";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "jar"]);

type UploadSessionRow = {
  id: string;
  user_email: string;
  attachment_id: string;
  operation_token: string;
  source_key: string;
  r2_upload_id: string;
  encrypted_drive_session_uri: string;
  drive_session_created_at: string;
  existing_drive_file_id: string;
  drive_file_id: string;
  destination_folder_id: string;
  company_folder_id: string;
  memo_folder_id: string;
  drive_path: string;
  file_name: string;
  mime_type: string;
  total_bytes: number;
  chunk_size: number;
  source_uploaded_bytes: number;
  confirmed_bytes: number;
  current_chunk: number;
  status: string;
  source_status: string;
  metadata_json: string;
  error_code: string;
  user_message: string;
  error_detail: string;
  failure_stage: string;
  retry_count: number;
  last_retry_at: string;
  auto_recoverable: number;
  user_action_required: number;
  created_at: string;
  updated_at: string;
  completed_at: string;
};

type AttachmentRow = {
  local_id: string;
  owner_kind: string;
  owner_local_id: string;
  storage_key: string;
  storage_provider: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  file_name: string;
  display_file_name: string;
  mime_type: string;
  file_size: string;
  metadata_json: string;
  created_at: string;
};

type UploadInitPayload = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  operationToken?: string;
  sourceKey?: string;
  sourceReady?: boolean;
};

let uploadSchemaPromise: Promise<void> | null = null;

function cleanName(value: string): string {
  const base = value.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[\u0000-\u001f<>:"|?*]+/g, "_").trim().slice(0, 220) || "attachment";
}

function extensionOf(fileName: string): string {
  const value = fileName.split(".").pop()?.toLowerCase() || "";
  return value === fileName.toLowerCase() ? "" : value.slice(0, 20);
}

function parseJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

async function currentUserEmail(): Promise<string> {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || "";
}

async function ensureUploadSchema(): Promise<void> {
  if (uploadSchemaPromise) return uploadSchemaPromise;
  uploadSchemaPromise = (async () => {
    await ensureSchema();
    const db = database();
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS work_note_upload_sessions (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        operation_token TEXT NOT NULL,
        source_key TEXT NOT NULL,
        r2_upload_id TEXT NOT NULL DEFAULT '',
        encrypted_drive_session_uri TEXT NOT NULL DEFAULT '',
        drive_session_created_at TEXT NOT NULL DEFAULT '',
        existing_drive_file_id TEXT NOT NULL DEFAULT '',
        drive_file_id TEXT NOT NULL DEFAULT '',
        destination_folder_id TEXT NOT NULL DEFAULT '',
        company_folder_id TEXT NOT NULL DEFAULT '',
        memo_folder_id TEXT NOT NULL DEFAULT '',
        drive_path TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        total_bytes INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        source_uploaded_bytes INTEGER NOT NULL DEFAULT 0,
        confirmed_bytes INTEGER NOT NULL DEFAULT 0,
        current_chunk INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        source_status TEXT NOT NULL DEFAULT 'pending',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        error_code TEXT NOT NULL DEFAULT '',
        user_message TEXT NOT NULL DEFAULT '',
        error_detail TEXT NOT NULL DEFAULT '',
        failure_stage TEXT NOT NULL DEFAULT '',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_retry_at TEXT NOT NULL DEFAULT '',
        auto_recoverable INTEGER NOT NULL DEFAULT 0,
        user_action_required INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT ''
      )`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS work_note_upload_sessions_token_idx
        ON work_note_upload_sessions(user_email, operation_token)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS work_note_upload_sessions_attachment_idx
        ON work_note_upload_sessions(user_email, attachment_id, updated_at)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS work_note_upload_parts (
        session_id TEXT NOT NULL,
        part_number INTEGER NOT NULL,
        byte_start INTEGER NOT NULL,
        byte_end INTEGER NOT NULL,
        part_size INTEGER NOT NULL,
        r2_etag TEXT NOT NULL,
        chunk_hash TEXT NOT NULL DEFAULT '',
        completed_at TEXT NOT NULL,
        PRIMARY KEY (session_id, part_number)
      )`),
    ]);
    const columns: Array<[string, string]> = [
      ["sync_error_code", "TEXT NOT NULL DEFAULT ''"],
      ["sync_error_message", "TEXT NOT NULL DEFAULT ''"],
      ["sync_error_detail", "TEXT NOT NULL DEFAULT ''"],
      ["failure_stage", "TEXT NOT NULL DEFAULT ''"],
      ["failed_at", "TEXT NOT NULL DEFAULT ''"],
      ["retry_count", "INTEGER NOT NULL DEFAULT 0"],
      ["last_retry_at", "TEXT NOT NULL DEFAULT ''"],
      ["last_retry_result", "TEXT NOT NULL DEFAULT ''"],
      ["auto_recoverable", "INTEGER NOT NULL DEFAULT 0"],
      ["user_action_required", "INTEGER NOT NULL DEFAULT 0"],
      ["upload_session_id", "TEXT NOT NULL DEFAULT ''"],
      ["processed_bytes", "INTEGER NOT NULL DEFAULT 0"],
      ["total_bytes", "INTEGER NOT NULL DEFAULT 0"],
      ["current_chunk", "INTEGER NOT NULL DEFAULT 0"],
      ["source_status", "TEXT NOT NULL DEFAULT ''"],
      ["source_storage_key", "TEXT NOT NULL DEFAULT ''"],
    ];
    const existing = await db.prepare("PRAGMA table_info(work_note_attachments)").all<{ name: string }>();
    const names = new Set(existing.results.map((column) => column.name));
    for (const [name, definition] of columns) {
      if (!names.has(name)) {
        await db.prepare(`ALTER TABLE work_note_attachments ADD COLUMN ${name} ${definition}`).run();
      }
    }
  })().catch((error) => {
    uploadSchemaPromise = null;
    throw error;
  });
  return uploadSchemaPromise;
}

async function sessionForUser(email: string, sessionId: string): Promise<UploadSessionRow | null> {
  return database().prepare(`SELECT * FROM work_note_upload_sessions
    WHERE user_email = ? AND id = ?`).bind(email, sessionId).first<UploadSessionRow>();
}

async function attachmentForUser(email: string, attachmentId: string): Promise<AttachmentRow | null> {
  return database().prepare(`SELECT local_id, owner_kind, owner_local_id, storage_key,
    storage_provider, drive_file_id, drive_folder_id, file_name, display_file_name,
    mime_type, file_size, metadata_json, created_at
    FROM work_note_attachments WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
    .bind(email, attachmentId).first<AttachmentRow>();
}

function sessionResponse(session: UploadSessionRow, extra: Record<string, unknown> = {}) {
  const totalBytes = Number(session.total_bytes || 0);
  const sourceUploaded = Number(session.source_uploaded_bytes || 0);
  const driveProcessed = Number(session.confirmed_bytes || 0);
  const processedBytes = session.source_status === "available" ? driveProcessed : sourceUploaded;
  return {
    ok: true,
    sessionId: session.id,
    attachmentId: session.attachment_id,
    status: session.status,
    sourceStatus: session.source_status,
    chunkSize: Number(session.chunk_size || DRIVE_UPLOAD_CHUNK_SIZE),
    nextOffset: session.source_status === "available" ? driveProcessed : sourceUploaded,
    processedBytes,
    driveProcessedBytes: driveProcessed,
    sourceUploadedBytes: sourceUploaded,
    totalBytes,
    currentChunk: Number(session.current_chunk || 0),
    progress: uploadProgressPercent(processedBytes, totalBytes),
    driveFileId: session.drive_file_id || "",
    retryCount: Number(session.retry_count || 0),
    error: session.error_code ? {
      code: session.error_code,
      message: session.user_message,
      detail: session.error_detail,
      stage: session.failure_stage,
      autoRecoverable: Boolean(session.auto_recoverable),
      userActionRequired: Boolean(session.user_action_required),
    } : null,
    ...extra,
  };
}

async function acquireSessionLock(email: string, sessionId: string): Promise<string> {
  const key = `upload-session:${sessionId}`;
  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  await database().prepare("DELETE FROM work_note_drive_locks WHERE expires_at < ?")
    .bind(now.toISOString()).run();
  await database().prepare(`INSERT INTO work_note_drive_locks
    (user_email, lock_key, owner_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_email, lock_key) DO NOTHING`)
    .bind(email, key, token, expires, now.toISOString()).run();
  const lock = await database().prepare(`SELECT owner_token FROM work_note_drive_locks
    WHERE user_email = ? AND lock_key = ?`).bind(email, key).first<{ owner_token: string }>();
  if (lock?.owner_token !== token) {
    throw new UploadProtocolError("DUPLICATE_OPERATION", undefined, {
      stage: "upload_lock",
      status: 409,
      retryable: true,
    });
  }
  return token;
}

async function releaseSessionLock(email: string, sessionId: string, token: string): Promise<void> {
  await database().prepare(`DELETE FROM work_note_drive_locks
    WHERE user_email = ? AND lock_key = ? AND owner_token = ?`)
    .bind(email, `upload-session:${sessionId}`, token).run();
}

type UploadDiagnosticInput = {
  operationType: "file_upload_failure" | "file_upload_retry" |
    "file_upload_recovery" | "file_upload_completion";
  status: string;
  errorCode?: string;
  failureStage?: string;
  userMessage?: string;
  completedAt?: string;
};

async function logUploadDiagnostic(
  email: string,
  sessionId: string,
  input: UploadDiagnosticInput,
): Promise<void> {
  const session = await sessionForUser(email, sessionId).catch(() => null);
  if (!session) return;
  const loggedAt = new Date().toISOString();
  const metadata = parseJson(session.metadata_json);
  const memoId = String(metadata.memoId || metadata.noteId || metadata.ownerId || "");
  const companyId = String(
    metadata.companyId || metadata.clientId || metadata.customerId || "",
  );
  await logDriveOperation(email, {
    operationType: input.operationType,
    targetId: session.attachment_id,
    status: input.status,
    errorMessage: input.userMessage || "",
    payload: {
      attachmentId: session.attachment_id,
      uploadSessionId: session.id,
      operation: input.operationType,
      status: input.status,
      errorCode: input.errorCode || "",
      failureStage: input.failureStage || "",
      memoId,
      companyId,
      fileName: session.file_name,
      fileSize: Number(session.total_bytes || 0),
      destinationFolderId: session.destination_folder_id,
      currentChunk: Number(session.current_chunk || 0),
      processedBytes: Number(session.confirmed_bytes || session.source_uploaded_bytes || 0),
      totalBytes: Number(session.total_bytes || 0),
      retryCount: Number(session.retry_count || 0),
      startedAt: session.created_at,
      completedAt: input.completedAt || session.completed_at || "",
      loggedAt,
    },
  }).catch(() => undefined);
}

async function persistFailure(email: string, sessionId: string, error: unknown, stage: string): Promise<void> {
  const failure = classifyUploadError(error, stage);
  const now = new Date().toISOString();
  const sourceMissing = failure.code === "R2_SOURCE_MISSING";
  const status = ["DRIVE_RECONNECT_REQUIRED", "DRIVE_NOT_CONNECTED"].includes(failure.code)
    ? "reconnect_required"
    : failure.retryable || failure.autoRecoverable ? "retry_required" : "failed";
  await database().batch([
    database().prepare(`UPDATE work_note_upload_sessions SET status = ?, error_code = ?,
      user_message = ?, error_detail = ?, failure_stage = ?, auto_recoverable = ?,
      user_action_required = ?, r2_upload_id = CASE WHEN ? THEN '' ELSE r2_upload_id END,
      source_uploaded_bytes = CASE WHEN ? THEN 0 ELSE source_uploaded_bytes END,
      current_chunk = CASE WHEN ? THEN 0 ELSE current_chunk END,
      source_status = CASE WHEN ? THEN 'missing' ELSE source_status END,
      updated_at = ? WHERE user_email = ? AND id = ?`)
      .bind(status, failure.code, failure.userMessage, failure.technicalDetail, failure.stage,
        failure.autoRecoverable ? 1 : 0, failure.userActionRequired ? 1 : 0,
        sourceMissing ? 1 : 0, sourceMissing ? 1 : 0, sourceMissing ? 1 : 0,
        sourceMissing ? 1 : 0, now, email, sessionId),
    database().prepare(`UPDATE work_note_attachments SET upload_status = ?, sync_status = ?,
      sync_error_code = ?, sync_error_message = ?, sync_error_detail = ?, failure_stage = ?,
      failed_at = ?, auto_recoverable = ?, user_action_required = ?,
      processed_bytes = CASE WHEN ? THEN 0 ELSE processed_bytes END,
      current_chunk = CASE WHEN ? THEN 0 ELSE current_chunk END,
      source_status = CASE WHEN ? THEN 'missing' ELSE source_status END,
      last_error = ?, last_retry_result = ?, updated_at = ?
      WHERE user_email = ? AND upload_session_id = ?`)
      .bind(status, status, failure.code, failure.userMessage, failure.technicalDetail,
        failure.stage, now, failure.autoRecoverable ? 1 : 0,
        failure.userActionRequired ? 1 : 0, sourceMissing ? 1 : 0,
        sourceMissing ? 1 : 0, sourceMissing ? 1 : 0, failure.userMessage,
        `${failure.code}: ${failure.userMessage}`, now, email, sessionId),
    database().prepare(`DELETE FROM work_note_upload_parts
      WHERE session_id = ? AND ? = 1`).bind(sessionId, sourceMissing ? 1 : 0),
  ]);
  await logUploadDiagnostic(email, sessionId, {
    operationType: "file_upload_failure",
    status,
    errorCode: failure.code,
    failureStage: failure.stage,
    userMessage: failure.userMessage,
  });
}

async function adoptCompletedSourceObject(
  email: string,
  session: UploadSessionRow,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  await database().batch([
    database().prepare(`UPDATE work_note_upload_sessions SET r2_upload_id = '',
      source_status = 'available',
      status = CASE WHEN status = 'synced' THEN status ELSE 'pending' END,
      source_uploaded_bytes = total_bytes, current_chunk = 0, error_code = '',
      user_message = '', error_detail = '', failure_stage = '',
      auto_recoverable = 0, user_action_required = 0, updated_at = ?
      WHERE user_email = ? AND id = ?`).bind(now, email, session.id),
    database().prepare(`UPDATE work_note_attachments SET source_status = 'available',
      source_storage_key = ?, storage_key = CASE WHEN storage_provider = 'site_storage'
        THEN ? ELSE storage_key END, processed_bytes = 0, current_chunk = 0,
      upload_status = CASE WHEN sync_status = 'synced' THEN upload_status ELSE 'pending' END,
      sync_status = CASE WHEN sync_status = 'synced' THEN sync_status ELSE 'pending' END,
      sync_error_code = '', sync_error_message = '', sync_error_detail = '',
      failure_stage = '', auto_recoverable = 0, user_action_required = 0,
      updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
      .bind(session.source_key, session.source_key, now, email, session.id),
  ]);
  return sessionResponse((await sessionForUser(email, session.id))!, {
    sourceAdopted: true,
  });
}

async function reinitializeExpiredSourceMultipart(
  email: string,
  session: UploadSessionRow,
  reason: "R2_UPLOAD_EXPIRED" | "R2_SOURCE_MISSING",
): Promise<Record<string, unknown>> {
  const result = await recoverExpiredSourceMultipart(Number(session.total_bytes), {
    head: () => fileBucket().head(session.source_key),
    create: async () => {
      const multipart = await fileBucket().createMultipartUpload(session.source_key, {
        httpMetadata: { contentType: session.mime_type },
        customMetadata: {
          managedBy: "work-note",
          attachmentId: session.attachment_id,
          operationToken: session.operation_token,
        },
      });
      return {
        uploadId: multipart.uploadId,
        abort: () => multipart.abort(),
      };
    },
    adopt: () => adoptCompletedSourceObject(email, session),
    reset: async (uploadId) => {
      const now = new Date().toISOString();
      await database().batch([
        database().prepare(`DELETE FROM work_note_upload_parts WHERE session_id = ?`)
          .bind(session.id),
        database().prepare(`UPDATE work_note_upload_sessions SET r2_upload_id = ?,
          source_uploaded_bytes = 0, current_chunk = 0, source_status = 'uploading',
          status = 'uploading', error_code = '', user_message = '', error_detail = '',
          failure_stage = '', auto_recoverable = 0, user_action_required = 0,
          updated_at = ? WHERE user_email = ? AND id = ?`)
          .bind(uploadId, now, email, session.id),
        database().prepare(`UPDATE work_note_attachments SET processed_bytes = 0,
          current_chunk = 0, source_status = 'uploading', source_storage_key = ?,
          upload_status = 'uploading', sync_status = 'uploading',
          sync_error_code = '', sync_error_message = '', sync_error_detail = '',
          failure_stage = '', auto_recoverable = 0, user_action_required = 0,
          updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
          .bind(session.source_key, now, email, session.id),
      ]);
      return sessionResponse((await sessionForUser(email, session.id))!, {
        sourceRestarted: true,
        restartReason: reason,
      });
    },
  });
  return result.value;
}

async function recoverReusableSourceSession(
  email: string,
  session: UploadSessionRow,
): Promise<Record<string, unknown>> {
  const lock = await acquireSessionLock(email, session.id);
  try {
    const current = await sessionForUser(email, session.id);
    if (!current) throw new UploadProtocolError("INVALID_FILE_METADATA", undefined, {
      stage: "source_reinitialize",
      status: 404,
    });
    if (current.source_status === "available") return sessionResponse(current, { reused: true });
    if (current.source_status !== "missing" && current.error_code !== "R2_UPLOAD_EXPIRED") {
      return sessionResponse(current, { reused: true });
    }
    const reason = current.source_status === "missing"
      ? "R2_SOURCE_MISSING"
      : "R2_UPLOAD_EXPIRED";
    return reinitializeExpiredSourceMultipart(email, current, reason);
  } finally {
    await releaseSessionLock(email, session.id, lock);
  }
}

async function initializeUpload(email: string, payload: UploadInitPayload) {
  const attachmentId = String(payload.id || "").trim().slice(0, 180);
  const fileName = cleanName(String(payload.fileName || payload.metadata?.fileName || ""));
  const mimeType = String(payload.mimeType || payload.metadata?.fileType || "application/octet-stream").slice(0, 180);
  const totalBytes = Number(payload.fileSize || payload.metadata?.fileSize || 0);
  if (!attachmentId || !fileName || !Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_FILE_SIZE) {
    throw new UploadProtocolError("INVALID_FILE_METADATA", undefined, { stage: "upload_init", status: 400 });
  }
  if (BLOCKED_EXTENSIONS.has(extensionOf(fileName))) {
    throw new UploadProtocolError("INVALID_FILE_METADATA", "보안상 업로드할 수 없는 파일 형식입니다.", {
      stage: "upload_init",
      status: 415,
    });
  }
  const operationToken = String(payload.operationToken || "").trim().slice(0, 180);
  if (operationToken) {
    const exact = await database().prepare(`SELECT * FROM work_note_upload_sessions
      WHERE user_email = ? AND operation_token = ?`).bind(email, operationToken).first<UploadSessionRow>();
    if (exact) return exact.source_status === "missing" || exact.error_code === "R2_UPLOAD_EXPIRED"
      ? recoverReusableSourceSession(email, exact)
      : sessionResponse(exact, { reused: true });
  }
  const active = await database().prepare(`SELECT * FROM work_note_upload_sessions
    WHERE user_email = ? AND attachment_id = ? AND file_name = ? AND total_bytes = ?
      AND status NOT IN ('aborted', 'synced')
    ORDER BY updated_at DESC LIMIT 1`).bind(email, attachmentId, fileName, totalBytes)
    .first<UploadSessionRow>();
  if (active) return active.source_status === "missing" || active.error_code === "R2_UPLOAD_EXPIRED"
    ? recoverReusableSourceSession(email, active)
    : sessionResponse(active, { reused: true });

  const existingAttachment = await attachmentForUser(email, attachmentId);
  let sourceKey = "";
  let sourceReady = false;
  if (payload.sourceKey && payload.sourceReady) {
    if (!existingAttachment || existingAttachment.storage_provider !== "site_storage"
      || existingAttachment.storage_key !== payload.sourceKey) {
      throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, {
        stage: "source_init",
        status: 404,
      });
    }
    const existingObject = await fileBucket().head(payload.sourceKey);
    if (!existingObject || existingObject.size !== totalBytes) {
      throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, {
        stage: "source_init",
        status: 404,
      });
    }
    sourceKey = payload.sourceKey;
    sourceReady = true;
  }

  const sessionId = crypto.randomUUID();
  sourceKey ||= `work-note-staging/${sessionId}`;
  const multipart = sourceReady ? null : await fileBucket().createMultipartUpload(sourceKey, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { managedBy: "work-note", attachmentId },
  });
  const token = operationToken || crypto.randomUUID();
  const now = new Date().toISOString();
  const metadata: Record<string, unknown> = {
    ...sanitizeBoundaryRecord(payload.metadata || {}),
    fileName,
    fileType: mimeType,
    fileSize: totalBytes,
  };
  const ownerKind = String(metadata.ownerType || metadata.backupOwnerType || existingAttachment?.owner_kind || "unknown").slice(0, 80);
  const ownerLocalId = String(metadata.ownerId || metadata.noteId || metadata.backupOwnerId || existingAttachment?.owner_local_id || "").slice(0, 180);
  await database().batch([
    database().prepare(`INSERT INTO work_note_upload_sessions
      (id, user_email, attachment_id, operation_token, source_key, r2_upload_id,
        encrypted_drive_session_uri, drive_session_created_at, existing_drive_file_id,
        drive_file_id, destination_folder_id, company_folder_id, memo_folder_id,
        drive_path, file_name, mime_type, total_bytes, chunk_size,
        source_uploaded_bytes, confirmed_bytes, current_chunk, status, source_status,
        metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '', '', ?, '', '', '', '', '', ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`)
      .bind(sessionId, email, attachmentId, token, sourceKey, multipart?.uploadId || "",
        existingAttachment?.drive_file_id || "", fileName, mimeType, totalBytes,
        DRIVE_UPLOAD_CHUNK_SIZE, sourceReady ? totalBytes : 0,
        sourceReady ? "pending" : "uploading", sourceReady ? "available" : "uploading",
        JSON.stringify(metadata), now, now),
    database().prepare(`INSERT INTO work_note_attachments
      (user_email, local_id, owner_kind, owner_local_id, storage_key, storage_provider,
        file_name, display_file_name, mime_type, extension, file_size, upload_status,
        preview_available, uploaded_by, metadata_json, migration_json, created_at,
        updated_at, sync_status, upload_session_id, processed_bytes, total_bytes,
        current_chunk, source_status, source_storage_key)
      VALUES (?, ?, ?, ?, ?, 'site_storage', ?, ?, ?, ?, ?, ?, 0, ?, ?, '{}', ?, ?, ?,
        ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_email, local_id) DO UPDATE SET
        owner_kind = excluded.owner_kind, owner_local_id = excluded.owner_local_id,
        file_name = excluded.file_name, display_file_name = excluded.display_file_name,
        mime_type = excluded.mime_type, extension = excluded.extension,
        file_size = excluded.file_size, upload_status = excluded.upload_status,
        sync_status = excluded.sync_status, upload_session_id = excluded.upload_session_id,
        processed_bytes = excluded.processed_bytes, total_bytes = excluded.total_bytes,
        current_chunk = 0, source_status = excluded.source_status,
        source_storage_key = excluded.source_storage_key, metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at, deleted_at = NULL`)
      .bind(email, attachmentId, ownerKind, ownerLocalId, sourceKey, fileName, fileName,
        mimeType, extensionOf(fileName), String(totalBytes), sourceReady ? "pending" : "uploading",
        email, JSON.stringify(metadata), now, now, sourceReady ? "pending" : "uploading",
        sessionId, sourceReady ? totalBytes : 0, totalBytes,
        sourceReady ? "available" : "uploading", sourceKey),
  ]);
  return sessionResponse((await sessionForUser(email, sessionId))!);
}

async function uploadSourcePart(email: string, request: Request, sessionId: string, partNumber: number) {
  const lock = await acquireSessionLock(email, sessionId);
  try {
    const session = await sessionForUser(email, sessionId);
    if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
      stage: "source_chunk", status: 404,
    });
    if (session.source_status === "available") return sessionResponse(session, { alreadyUploaded: true });
    if (session.source_status === "missing" || session.error_code === "R2_UPLOAD_EXPIRED") {
      return reinitializeExpiredSourceMultipart(
        email,
        session,
        session.source_status === "missing" ? "R2_SOURCE_MISSING" : "R2_UPLOAD_EXPIRED",
      );
    }
    if (!request.body) throw new UploadProtocolError("FILE_STREAM_ERROR", "파일 조각이 비어 있습니다.", {
      stage: "source_chunk", status: 400,
    });
    const range = parseContentRange(request.headers.get("Content-Range"));
    const finalPart = range.end === range.total - 1;
    if (range.total !== Number(session.total_bytes) || range.length > Number(session.chunk_size)
      || (!finalPart && range.length !== Number(session.chunk_size))
      || partNumber !== Math.floor(range.start / Number(session.chunk_size)) + 1) {
      throw new UploadProtocolError("INVALID_CONTENT_RANGE", undefined, {
        stage: "source_chunk", status: 409,
      });
    }
    const expected = Number(session.source_uploaded_bytes || 0);
    if (range.start < expected) {
      const existing = await database().prepare(`SELECT part_size FROM work_note_upload_parts
        WHERE session_id = ? AND part_number = ?`).bind(sessionId, partNumber)
        .first<{ part_size: number }>();
      if (existing && Number(existing.part_size) === range.length) {
        return sessionResponse(session, { alreadyUploaded: true, partNumber });
      }
    }
    if (range.start !== expected) {
      throw new UploadProtocolError("INVALID_CONTENT_RANGE", `다음 업로드 위치는 ${expected}바이트입니다.`, {
        stage: "source_chunk", status: 409,
      });
    }
    const multipart = fileBucket().resumeMultipartUpload(session.source_key, session.r2_upload_id);
    let part;
    try {
      part = await multipart.uploadPart(partNumber, request.body);
    } catch (error) {
      const failure = classifyUploadError(error, "source_chunk");
      if (failure.code === "R2_UPLOAD_EXPIRED") {
        return reinitializeExpiredSourceMultipart(email, session, "R2_UPLOAD_EXPIRED");
      }
      throw error;
    }
    const now = new Date().toISOString();
    const nextOffset = range.end + 1;
    await database().batch([
      database().prepare(`INSERT INTO work_note_upload_parts
        (session_id, part_number, byte_start, byte_end, part_size, r2_etag, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, part_number) DO UPDATE SET byte_start = excluded.byte_start,
          byte_end = excluded.byte_end, part_size = excluded.part_size,
          r2_etag = excluded.r2_etag, completed_at = excluded.completed_at`)
        .bind(sessionId, partNumber, range.start, range.end, range.length, part.etag, now),
      database().prepare(`UPDATE work_note_upload_sessions SET source_uploaded_bytes = ?,
        current_chunk = ?, status = 'uploading', source_status = 'uploading',
        updated_at = ? WHERE user_email = ? AND id = ?`)
        .bind(nextOffset, partNumber, now, email, sessionId),
      database().prepare(`UPDATE work_note_attachments SET processed_bytes = ?,
        current_chunk = ?, upload_status = 'uploading', sync_status = 'uploading',
        source_status = 'uploading', updated_at = ?
        WHERE user_email = ? AND upload_session_id = ?`)
        .bind(nextOffset, partNumber, now, email, sessionId),
    ]);
    return sessionResponse((await sessionForUser(email, sessionId))!, { partNumber });
  } finally {
    await releaseSessionLock(email, sessionId, lock);
  }
}

async function completeSource(email: string, sessionId: string) {
  const lock = await acquireSessionLock(email, sessionId);
  try {
    let session = await sessionForUser(email, sessionId);
    if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
      stage: "source_complete", status: 404,
    });
    const existingObject = await fileBucket().head(session.source_key);
    if (existingObject?.size === Number(session.total_bytes)) {
      return {
        ...await adoptCompletedSourceObject(email, session),
        alreadyCompleted: true,
        recoveredAfterComplete: session.source_status !== "available",
      };
    }
    if (session.source_status === "available") {
      throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, {
        stage: "source_complete", status: 404,
      });
    }
    if (Number(session.source_uploaded_bytes) !== Number(session.total_bytes)) {
      throw new UploadProtocolError("FILE_SIZE_MISMATCH", "모든 파일 조각이 아직 전송되지 않았습니다.", {
        stage: "source_complete", status: 409, retryable: true,
      });
    }
    const parts = await database().prepare(`SELECT part_number, byte_start, byte_end,
      part_size, r2_etag FROM work_note_upload_parts WHERE session_id = ? ORDER BY part_number`)
      .bind(sessionId).all<{
        part_number: number;
        byte_start: number;
        byte_end: number;
        part_size: number;
        r2_etag: string;
      }>();
    let expected = 0;
    for (let index = 0; index < parts.results.length; index += 1) {
      const part = parts.results[index];
      if (Number(part.part_number) !== index + 1 || Number(part.byte_start) !== expected) {
        throw new UploadProtocolError("INVALID_CONTENT_RANGE", "파일 조각이 연속되지 않습니다.", {
          stage: "source_complete", status: 409,
        });
      }
      expected = Number(part.byte_end) + 1;
    }
    if (expected !== Number(session.total_bytes)) {
      throw new UploadProtocolError("FILE_SIZE_MISMATCH", undefined, {
        stage: "source_complete", status: 409, retryable: true,
      });
    }
    const multipart = fileBucket().resumeMultipartUpload(session.source_key, session.r2_upload_id);
    let completed;
    try {
      completed = await multipart.complete(parts.results.map((part) => ({
        partNumber: Number(part.part_number),
        etag: part.r2_etag,
      })));
    } catch (error) {
      const failure = classifyUploadError(error, "source_complete");
      if (failure.code === "R2_UPLOAD_EXPIRED") {
        return reinitializeExpiredSourceMultipart(email, session, "R2_UPLOAD_EXPIRED");
      }
      throw error;
    }
    if (completed.size !== Number(session.total_bytes)) {
      throw new UploadProtocolError("FILE_SIZE_MISMATCH", undefined, {
        stage: "source_complete", status: 409, retryable: true,
      });
    }
    const now = new Date().toISOString();
    await database().batch([
      database().prepare(`UPDATE work_note_upload_sessions SET r2_upload_id = '',
        source_status = 'available', status = 'pending', current_chunk = 0,
        error_code = '', user_message = '', error_detail = '',
        failure_stage = '', updated_at = ? WHERE user_email = ? AND id = ?`)
        .bind(now, email, sessionId),
      database().prepare(`UPDATE work_note_attachments SET source_status = 'available',
        source_storage_key = ?, storage_key = CASE WHEN storage_provider = 'site_storage'
          THEN ? ELSE storage_key END, upload_status = 'pending', sync_status = 'pending',
        processed_bytes = 0, current_chunk = 0, updated_at = ?
        WHERE user_email = ? AND upload_session_id = ?`)
        .bind(session.source_key, session.source_key, now, email, sessionId),
    ]);
    session = (await sessionForUser(email, sessionId))!;
    return sessionResponse(session);
  } finally {
    await releaseSessionLock(email, sessionId, lock);
  }
}

async function contextAndFolders(email: string, session: UploadSessionRow) {
  const attachment = await attachmentForUser(email, session.attachment_id);
  if (!attachment) throw new UploadProtocolError("INVALID_FILE_METADATA", "첨부파일 정보를 찾을 수 없습니다.", {
    stage: "folder_resolve", status: 404,
  });
  const metadata = { ...parseJson(attachment.metadata_json), ...parseJson(session.metadata_json) };
  const dataset = await loadWorkNoteDataset(email);
  const context = resolveAttachmentOwnerContext({
    dataset,
    ownerKind: attachment.owner_kind,
    ownerLocalId: attachment.owner_local_id,
    metadata,
    fileName: session.file_name,
    mimeType: session.mime_type,
    category: metadata.category,
    uploadedAt: attachment.created_at,
  });
  const folders = await ensureManagedAttachmentFolders(email, context);
  return { attachment, metadata, context, folders };
}

async function completedDriveFileForOperation(
  email: string,
  session: UploadSessionRow,
  destinationFolderId: string,
): Promise<DriveFileMetadata | null> {
  const candidates = await findDriveFilesForAttachment(email, session.attachment_id, {
    operationToken: session.operation_token,
  });
  const decision = decideDriveFileAdoption(candidates, {
    attachmentId: session.attachment_id,
    operationToken: session.operation_token,
    totalBytes: Number(session.total_bytes),
  });
  if (decision.kind === "create") return null;
  if (decision.kind === "duplicate") {
    throw new UploadProtocolError(
      "DUPLICATE_OPERATION",
      "같은 업로드 작업으로 생성된 Drive 파일이 여러 개이거나 크기가 일치하지 않습니다.",
      { stage: "drive_adopt", status: 409, retryable: false },
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
      stage: "drive_adopt_move",
      status: 409,
      retryable: true,
    });
  }
  return moved;
}

async function finalizeDriveUpload(
  email: string,
  session: UploadSessionRow,
  metadata: DriveFileMetadata,
  context: AttachmentOwnerContext,
  folders: Awaited<ReturnType<typeof ensureManagedAttachmentFolders>>,
  adopted = false,
) {
  const placedMetadata = await ensureDriveFileParent(
    email,
    metadata,
    folders.categoryFolderId,
  );
  if (!placedMetadata.id || Number(placedMetadata.size || 0) !== Number(session.total_bytes)) {
    throw new UploadProtocolError("FILE_SIZE_MISMATCH", undefined, {
      stage: "drive_finalize", status: 409, retryable: true,
    });
  }
  const now = new Date().toISOString();
  const drivePath = buildDrivePath(context, session.file_name);
  const previousMetadata = parseJson(session.metadata_json);
  const nextMetadata = {
    ...previousMetadata,
    storageProvider: "google_drive",
    driveFileId: placedMetadata.id,
    driveFolderId: folders.categoryFolderId,
    driveCompanyFolderId: folders.companyFolderId,
    driveMemoFolderId: folders.memoFolderId,
    driveCategoryFolderId: folders.categoryFolderId,
    drivePath,
    driveWebViewLink: placedMetadata.webViewLink || driveFileUrl(placedMetadata.id),
    driveMemoFolderUrl: folders.memoFolderUrl,
    category: context.category,
    uploadStatus: "synced",
    syncStatus: "synced",
    lastSyncedAt: now,
    sourceStatus: "available",
  };
  await database().batch([
    database().prepare(`UPDATE work_note_attachments SET storage_provider = 'google_drive',
      drive_file_id = ?, drive_folder_id = ?, drive_company_folder_id = ?,
      drive_memo_folder_id = ?, drive_category_folder_id = ?, drive_path = ?,
      drive_web_view_link = ?, file_category = ?, upload_status = 'completed',
      sync_status = 'synced', last_synced_at = ?, last_error = '',
      sync_error_code = '', sync_error_message = '', sync_error_detail = '', failure_stage = '',
      auto_recoverable = 0, user_action_required = 0, processed_bytes = ?,
      total_bytes = ?, source_status = 'available', source_storage_key = ?,
      current_chunk = ?, metadata_json = ?, last_retry_result = '성공', updated_at = ?
      WHERE user_email = ? AND local_id = ?`)
      .bind(placedMetadata.id, folders.categoryFolderId, folders.companyFolderId,
        folders.memoFolderId, folders.categoryFolderId, drivePath,
        placedMetadata.webViewLink || driveFileUrl(placedMetadata.id), context.category, now,
        session.total_bytes, session.total_bytes, session.source_key,
        Math.ceil(Number(session.total_bytes) / Number(session.chunk_size)),
        JSON.stringify(nextMetadata), now, email, session.attachment_id),
    database().prepare(`UPDATE work_note_upload_sessions SET status = 'synced',
      drive_file_id = ?, destination_folder_id = ?, company_folder_id = ?,
      memo_folder_id = ?, drive_path = ?, confirmed_bytes = total_bytes,
      current_chunk = CAST((total_bytes + chunk_size - 1) / chunk_size AS INTEGER),
      error_code = '', user_message = '', error_detail = '', failure_stage = '',
      auto_recoverable = 0, user_action_required = 0, completed_at = ?, updated_at = ?
      WHERE user_email = ? AND id = ?`)
      .bind(placedMetadata.id, folders.categoryFolderId, folders.companyFolderId,
        folders.memoFolderId, drivePath, now, now, email, session.id),
  ]);
  await logDriveOperation(email, {
    operationType: adopted ? "file_upload_adopt" : "file_upload",
    targetId: placedMetadata.id,
    afterPath: drivePath,
    status: "completed",
    payload: {
      attachmentId: session.attachment_id,
      memoId: context.memoId,
      companyId: context.companyId,
      fileName: session.file_name,
      fileSize: session.total_bytes,
      uploadSessionId: session.id,
      processedBytes: session.total_bytes,
      destinationFolderId: folders.categoryFolderId,
      retryCount: session.retry_count,
      completedAt: now,
    },
  });
  await logUploadDiagnostic(email, session.id, {
    operationType: "file_upload_completion",
    status: "completed",
    completedAt: now,
  });
  return sessionResponse((await sessionForUser(email, session.id))!, { adopted });
}

async function initializeDrive(email: string, sessionId: string) {
  const lock = await acquireSessionLock(email, sessionId);
  let placementLease: DriveFolderPlacementLease | null = null;
  try {
    let session = await sessionForUser(email, sessionId);
    if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
      stage: "drive_init", status: 404,
    });
    if (session.status === "synced") return sessionResponse(session);
    const source = await fileBucket().head(session.source_key);
    if (!source || source.size !== Number(session.total_bytes)) {
      throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, {
        stage: "drive_init", status: 404,
      });
    }
    if (!await getDriveConnection(email)) {
      throw new UploadProtocolError("DRIVE_NOT_CONNECTED", undefined, {
        stage: "drive_connect", status: 409,
      });
    }
    placementLease = await acquireDriveFolderPlacementLock(email);
    const { attachment, context, folders } = await contextAndFolders(email, session);
    const completed = session.existing_drive_file_id
      ? null
      : await completedDriveFileForOperation(email, session, folders.categoryFolderId);
    if (completed) return finalizeDriveUpload(email, session, completed, context, folders, true);

    if (!session.encrypted_drive_session_uri) {
      const started = await createDriveResumableSession(email, {
        name: session.file_name,
        mimeType: session.mime_type,
        size: Number(session.total_bytes),
        folderId: folders.categoryFolderId,
        existingFileId: attachment.drive_file_id || session.existing_drive_file_id || undefined,
        appProperties: {
          managedBy: "work-note",
          attachmentId: session.attachment_id,
          operationToken: session.operation_token,
          memoId: context.memoId,
          companyId: context.companyId,
        },
      });
      const now = new Date().toISOString();
      await database().batch([
        database().prepare(`UPDATE work_note_upload_sessions SET
          encrypted_drive_session_uri = ?, drive_session_created_at = ?,
          destination_folder_id = ?, company_folder_id = ?, memo_folder_id = ?,
          drive_path = ?, status = 'uploading', error_code = '', user_message = '',
          error_detail = '', failure_stage = '', updated_at = ?
          WHERE user_email = ? AND id = ?`)
          .bind(await encryptSecret(started.sessionUri), started.createdAt,
            folders.categoryFolderId, folders.companyFolderId, folders.memoFolderId,
            buildDrivePath(context, session.file_name), now, email, sessionId),
        database().prepare(`UPDATE work_note_attachments SET upload_status = 'uploading',
          sync_status = 'uploading', drive_folder_id = ?, drive_company_folder_id = ?,
          drive_memo_folder_id = ?, drive_category_folder_id = ?, drive_path = ?,
          updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
          .bind(folders.categoryFolderId, folders.companyFolderId, folders.memoFolderId,
            folders.categoryFolderId, buildDrivePath(context, session.file_name),
            now, email, sessionId),
      ]);
    }
    session = (await sessionForUser(email, sessionId))!;
    return sessionResponse(session);
  } finally {
    if (placementLease) {
      await releaseDriveFolderPlacementLock(email, placementLease).catch(() => undefined);
    }
    await releaseSessionLock(email, sessionId, lock);
  }
}

async function driveNext(email: string, sessionId: string) {
  const lock = await acquireSessionLock(email, sessionId);
  try {
    let session = await sessionForUser(email, sessionId);
    if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
      stage: "drive_chunk", status: 404,
    });
    if (session.status === "synced") return sessionResponse(session);
    if (!session.encrypted_drive_session_uri) {
      throw new UploadProtocolError("UPLOAD_SESSION_EXPIRED", undefined, {
        stage: "drive_session", status: 409, retryable: true,
      });
    }
    const { context, folders } = await contextAndFolders(email, session);
    const total = Number(session.total_bytes);
    const confirmed = Number(session.confirmed_bytes || 0);
    if (confirmed >= total) {
      const completed = await completedDriveFileForOperation(
        email,
        session,
        folders.categoryFolderId,
      );
      if (completed) return finalizeDriveUpload(email, session, completed, context, folders, true);
      throw new UploadProtocolError("FILE_STREAM_ERROR", "Drive 완료 파일을 확인하지 못했습니다.", {
        stage: "drive_finalize", status: 503, retryable: true,
      });
    }
    const range = byteRangeForOffset(total, confirmed, Number(session.chunk_size));
    const source = await fileBucket().get(session.source_key, {
      range: { offset: range.start, length: range.length },
    });
    if (!source?.body) {
      throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, {
        stage: "drive_chunk", status: 404,
      });
    }
    const sessionUri = await decryptSecret(session.encrypted_drive_session_uri);
    try {
      const result = await uploadDriveResumableChunk(email, sessionUri, {
        body: source.body,
        start: range.start,
        end: range.end,
        total,
        mimeType: session.mime_type,
      });
      if (result.complete && result.metadata) {
        return finalizeDriveUpload(email, session, result.metadata, context, folders);
      }
      const nextUri = result.sessionUri ? await encryptSecret(result.sessionUri) : "";
      const now = new Date().toISOString();
      await database().batch([
        database().prepare(`UPDATE work_note_upload_sessions SET confirmed_bytes = ?,
          current_chunk = ?, status = 'uploading',
          encrypted_drive_session_uri = CASE WHEN ? = '' THEN encrypted_drive_session_uri ELSE ? END,
          updated_at = ? WHERE user_email = ? AND id = ?`)
          .bind(result.confirmedBytes, range.partNumber, nextUri, nextUri, now, email, sessionId),
        database().prepare(`UPDATE work_note_attachments SET processed_bytes = ?,
          current_chunk = ?, upload_status = 'uploading', sync_status = 'uploading',
          updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
          .bind(result.confirmedBytes, range.partNumber, now, email, sessionId),
      ]);
      return sessionResponse((await sessionForUser(email, sessionId))!);
    } catch (error) {
      const failure = classifyUploadError(error, "drive_chunk");
      await logUploadDiagnostic(email, sessionId, {
        operationType: "file_upload_failure",
        status: failure.retryable || failure.autoRecoverable ? "retrying" : "failed",
        errorCode: failure.code,
        failureStage: failure.stage,
        userMessage: failure.userMessage,
      });
      if (failure.retryable && failure.code !== "UPLOAD_SESSION_EXPIRED") {
        try {
          let recoveredProbe: Awaited<ReturnType<typeof queryDriveResumableStatus>> | null = null;
          const recovery = await recoverDriveNextFailure(error, {
            refreshAccessToken: async () => {
              await invalidateDriveAccessToken(email);
              await accessTokenForUser(email);
            },
            rebuildCanonicalFolder: async () => {
              await contextAndFolders(email, session);
            },
            probeUploadSession: async () => {
              try {
                recoveredProbe = await queryDriveResumableStatus(email, sessionUri, total);
                return true;
              } catch (probeError) {
                const probeFailure = classifyUploadError(probeError, "drive_session_probe");
                if (probeFailure.code === "UPLOAD_SESSION_EXPIRED") return false;
                throw probeError;
              }
            },
            restartUploadSession: async () => {
              throw new UploadProtocolError("UPLOAD_SESSION_EXPIRED", undefined, {
                stage: "drive_session", status: 409, retryable: true,
              });
            },
            waitBeforeRetry: async () => {
              const delay = Math.min(1_500, retryDelayMs(Number(session.retry_count || 0)));
              if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
            },
            retryStep: async () => recoveredProbe ||
              queryDriveResumableStatus(email, sessionUri, total),
          });
          const probe = recovery.result;
          const refreshed = await contextAndFolders(email, session);
          if (probe.complete && probe.metadata) {
            await logUploadDiagnostic(email, sessionId, {
              operationType: "file_upload_recovery",
              status: "completed",
              errorCode: recovery.errorCode,
              failureStage: failure.stage,
            });
            return finalizeDriveUpload(
              email,
              session,
              probe.metadata,
              refreshed.context,
              refreshed.folders,
            );
          }
          const now = new Date().toISOString();
          await database().batch([
            database().prepare(`UPDATE work_note_upload_sessions SET confirmed_bytes = ?,
              current_chunk = CAST((? + chunk_size - 1) / chunk_size AS INTEGER),
              status = 'uploading', updated_at = ? WHERE user_email = ? AND id = ?`)
              .bind(probe.confirmedBytes, probe.confirmedBytes, now, email, sessionId),
            database().prepare(`UPDATE work_note_attachments SET processed_bytes = ?,
              current_chunk = CAST((? + ? - 1) / ? AS INTEGER),
              upload_status = 'uploading', sync_status = 'uploading', updated_at = ?
              WHERE user_email = ? AND upload_session_id = ?`)
              .bind(probe.confirmedBytes, probe.confirmedBytes, DRIVE_UPLOAD_CHUNK_SIZE,
                DRIVE_UPLOAD_CHUNK_SIZE, now, email, sessionId),
          ]);
          await logUploadDiagnostic(email, sessionId, {
            operationType: "file_upload_recovery",
            status: "completed",
            errorCode: recovery.errorCode,
            failureStage: failure.stage,
          });
          return sessionResponse((await sessionForUser(email, sessionId))!, {
            recovered: true,
            recoveryAction: recovery.action,
          });
        } catch (recoveryError) {
          const recoveryFailure = classifyUploadError(recoveryError, "drive_recovery");
          if (recoveryFailure.code === "DRIVE_RECONNECT_REQUIRED") throw recoveryError;
        }
      }
      throw error;
    }
  } finally {
    await releaseSessionLock(email, sessionId, lock);
  }
}

async function retryUpload(email: string, sessionId: string) {
  let session = await sessionForUser(email, sessionId);
  if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
    stage: "retry", status: 404,
  });
  const now = new Date().toISOString();
  await database().batch([
    database().prepare(`UPDATE work_note_upload_sessions SET retry_count = retry_count + 1,
      last_retry_at = ?, error_code = '', user_message = '', error_detail = '',
      failure_stage = '', updated_at = ? WHERE user_email = ? AND id = ?`)
      .bind(now, now, email, sessionId),
    database().prepare(`UPDATE work_note_attachments SET retry_count = retry_count + 1,
      last_retry_at = ?, sync_error_code = '', sync_error_message = '',
      sync_error_detail = '', failure_stage = '', last_retry_result = '재시도 중',
      updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
      .bind(now, now, email, sessionId),
  ]);
  await logUploadDiagnostic(email, sessionId, {
    operationType: "file_upload_retry",
    status: "retrying",
    failureStage: "retry",
  });
  const source = await fileBucket().head(session.source_key);
  if (!source || source.size !== Number(session.total_bytes)) {
    throw new UploadProtocolError("R2_SOURCE_MISSING", undefined, { stage: "retry_source", status: 404 });
  }
  if (!await getDriveConnection(email)) {
    throw new UploadProtocolError("DRIVE_NOT_CONNECTED", undefined, { stage: "retry_connect", status: 409 });
  }
  session = (await sessionForUser(email, sessionId))!;
  if (session.encrypted_drive_session_uri) {
    try {
      const probe = await queryDriveResumableStatus(
        email,
        await decryptSecret(session.encrypted_drive_session_uri),
        Number(session.total_bytes),
      );
      const { context, folders } = await contextAndFolders(email, session);
      if (probe.complete && probe.metadata) {
        return finalizeDriveUpload(email, session, probe.metadata, context, folders, true);
      }
      await database().prepare(`UPDATE work_note_upload_sessions SET confirmed_bytes = ?,
        status = 'uploading', updated_at = ? WHERE user_email = ? AND id = ?`)
        .bind(probe.confirmedBytes, now, email, sessionId).run();
    } catch (error) {
      const failure = classifyUploadError(error, "retry_status");
      if (failure.code === "UPLOAD_SESSION_EXPIRED") {
        await database().prepare(`UPDATE work_note_upload_sessions SET
          encrypted_drive_session_uri = '', drive_session_created_at = '',
          confirmed_bytes = 0, current_chunk = 0, updated_at = ?
          WHERE user_email = ? AND id = ?`).bind(now, email, sessionId).run();
      } else if (!failure.retryable) {
        throw error;
      }
    }
  }
  session = (await sessionForUser(email, sessionId))!;
  if (!session.encrypted_drive_session_uri) await initializeDrive(email, sessionId);
  return driveNext(email, sessionId);
}

async function abortUpload(email: string, sessionId: string) {
  const session = await sessionForUser(email, sessionId);
  if (!session) return { ok: true, sessionId, status: "aborted" };
  if (session.source_status !== "available" && session.r2_upload_id) {
    try {
      await fileBucket().resumeMultipartUpload(session.source_key, session.r2_upload_id).abort();
    } catch { /* Incomplete R2 uploads also expire automatically. */ }
  }
  const now = new Date().toISOString();
  await database().batch([
    database().prepare(`UPDATE work_note_upload_sessions SET status = 'aborted',
      encrypted_drive_session_uri = '', updated_at = ? WHERE user_email = ? AND id = ?`)
      .bind(now, email, sessionId),
    database().prepare(`UPDATE work_note_attachments SET upload_status = 'failed',
      sync_status = 'failed', updated_at = ? WHERE user_email = ? AND upload_session_id = ?`)
      .bind(now, email, sessionId),
  ]);
  return sessionResponse((await sessionForUser(email, sessionId))!);
}

async function payloadSessionId(
  email: string,
  request: Request,
): Promise<{ sessionId: string; attachmentId: string; payload: Record<string, unknown> }> {
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  let sessionId = String(payload.sessionId || "").trim();
  const attachmentId = String(payload.attachmentId || "").trim().slice(0, 180);
  if (!sessionId && attachmentId) {
    const existing = await database().prepare(`SELECT id FROM work_note_upload_sessions
      WHERE user_email = ? AND attachment_id = ?
      ORDER BY updated_at DESC LIMIT 1`).bind(email, attachmentId).first<{ id: string }>();
    sessionId = existing?.id || "";
  }
  return { sessionId, attachmentId, payload };
}

export async function GET(request: Request) {
  const email = await currentUserEmail();
  if (!email) return uploadErrorResponse(new Error("Google Drive 연결이 필요합니다."), "auth", { status: "reconnect_required" });
  try {
    await ensureUploadSchema();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const attachmentId = url.searchParams.get("attachmentId") || "";
    const session = sessionId
      ? await sessionForUser(email, sessionId)
      : attachmentId
        ? await database().prepare(`SELECT * FROM work_note_upload_sessions
          WHERE user_email = ? AND attachment_id = ? ORDER BY updated_at DESC LIMIT 1`)
          .bind(email, attachmentId).first<UploadSessionRow>()
        : null;
    if (!session) throw new UploadProtocolError("INVALID_FILE_METADATA", "업로드 작업을 찾을 수 없습니다.", {
      stage: "status", status: 404,
    });
    return Response.json(sessionResponse(session));
  } catch (error) {
    return uploadErrorResponse(error, "status");
  }
}

export async function PUT(request: Request) {
  const email = await currentUserEmail();
  if (!email) return uploadErrorResponse(new Error("Google Drive 연결이 필요합니다."), "auth");
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || "";
  try {
    await ensureUploadSchema();
    if (url.searchParams.get("action") !== "part") {
      throw new UploadProtocolError("INVALID_FILE_METADATA", "지원하지 않는 업로드 작업입니다.", {
        stage: "source_chunk", status: 400,
      });
    }
    const partNumber = Number(url.searchParams.get("partNumber") || 0);
    if (!sessionId || !Number.isSafeInteger(partNumber) || partNumber < 1) {
      throw new UploadProtocolError("INVALID_CONTENT_RANGE", undefined, {
        stage: "source_chunk", status: 400,
      });
    }
    return Response.json(await uploadSourcePart(email, request, sessionId, partNumber));
  } catch (error) {
    if (sessionId) {
      try { await persistFailure(email, sessionId, error, "source_chunk"); } catch { /* Keep root error. */ }
    }
    const failure = classifyUploadError(error, "source_chunk");
    const current = sessionId ? await sessionForUser(email, sessionId).catch(() => null) : null;
    return uploadErrorResponse(error, "source_chunk", {
      sessionId,
      sourceStatus: failure.code === "R2_SOURCE_MISSING"
        ? "missing"
        : current?.source_status || "",
    });
  }
}

export async function POST(request: Request) {
  const email = await currentUserEmail();
  if (!email) return uploadErrorResponse(new Error("Google Drive 연결이 필요합니다."), "auth");
  const action = new URL(request.url).searchParams.get("action") || "";
  let sessionId = "";
  try {
    await ensureUploadSchema();
    if (action === "init") {
      const payload = await request.json().catch(() => ({})) as UploadInitPayload;
      return Response.json(await initializeUpload(email, payload));
    }
    const parsed = await payloadSessionId(email, request);
    sessionId = parsed.sessionId;
    if (!sessionId) throw new UploadProtocolError("INVALID_FILE_METADATA", "첨부파일의 업로드 작업을 찾을 수 없습니다.", {
      stage: action || "upload", status: 400,
    });
    if (action === "source-complete") return Response.json(await completeSource(email, sessionId));
    if (action === "drive-init") return Response.json(await initializeDrive(email, sessionId));
    if (action === "drive-next") return Response.json(await driveNext(email, sessionId));
    if (action === "retry") return Response.json(await retryUpload(email, sessionId));
    if (action === "abort") return Response.json(await abortUpload(email, sessionId));
    throw new UploadProtocolError("INVALID_FILE_METADATA", "지원하지 않는 업로드 작업입니다.", {
      stage: action || "upload", status: 400,
    });
  } catch (error) {
    if (sessionId) {
      try { await persistFailure(email, sessionId, error, action || "upload"); } catch { /* Keep root error. */ }
    }
    const failure = classifyUploadError(error, action || "upload");
    const current = sessionId ? await sessionForUser(email, sessionId).catch(() => null) : null;
    return uploadErrorResponse(error, action || "upload", {
      sessionId,
      status: failure.code === "DRIVE_RECONNECT_REQUIRED" || failure.code === "DRIVE_NOT_CONNECTED"
        ? "reconnect_required" : failure.retryable ? "retry_required" : "failed",
      sourceStatus: failure.code === "R2_SOURCE_MISSING"
        ? "missing"
        : current?.source_status || "",
      retryAfterMs: failure.retryable ? retryDelayMs(1) : 0,
    });
  }
}
