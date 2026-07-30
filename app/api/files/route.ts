import { database, ensureSchema } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import { ensureAttachmentFolder, getDriveFileMetadata, trashDriveFile } from "@/app/google-drive/files";
import { getSiteUser } from "@/app/site-user";
import { storageProvider, type StoredFileReference } from "@/app/storage/provider";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set(["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "jar"]);

type AttachmentRow = {
  storage_key: string;
  storage_provider: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  file_name: string;
  display_file_name: string;
  mime_type: string;
  extension: string;
  file_size: string;
  sha256: string | null;
  upload_status: string;
  preview_available: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
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
    driveFolderId: row.drive_folder_id || undefined,
    fileName: row.display_file_name || row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
  };
}

async function findAttachment(email: string, id: string): Promise<AttachmentRow | null> {
  return database().prepare(`SELECT storage_key, storage_provider, drive_file_id,
    drive_folder_id, file_name, display_file_name, mime_type, extension,
    file_size, sha256, upload_status, preview_available, metadata_json,
    created_at, updated_at FROM work_note_attachments
    WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
    .bind(email, id).first<AttachmentRow>();
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
    const metadata = parseMetadata(row.metadata_json);
    if (url.searchParams.get("metadata") === "1") {
      return Response.json({
        ...metadata,
        id,
        fileName: row.display_file_name || row.file_name,
        originalFileName: row.file_name,
        fileType: row.mime_type,
        fileSize: Number(row.file_size || 0),
        extension: row.extension,
        sha256: row.sha256 || "",
        storageProvider: row.storage_provider || "site_storage",
        driveFileId: row.drive_file_id || "",
        driveFolderId: row.drive_folder_id || "",
        uploadStatus: row.upload_status,
        previewAvailable: Boolean(row.preview_available),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
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
    const folderId = await ensureAttachmentFolder(email, ownerKind, ownerLocalId, uploadedAt);
    const existingRow = await findAttachment(email, id);
    replacingExistingDriveFile = existingRow?.storage_provider === "google_drive" && Boolean(existingRow.drive_file_id);
    const stored = await storageProvider("google_drive").uploadFile({
      userEmail: email,
      fileName: originalName,
      mimeType,
      fileSize: file.size,
      body: file.stream(),
      folderId,
      existing: existingRow ? fileReference(existingRow) : null,
    });
    uploadedDriveFileId = stored.driveFileId || "";
    const safeMetadata: Record<string, unknown> = { ...metadata, storageProvider: "google_drive", driveFileId: uploadedDriveFileId,
      driveFolderId: stored.driveFolderId || folderId, uploadStatus: "completed",
      previewAvailable: stored.previewAvailable };
    delete safeMetadata.blob;
    const now = new Date().toISOString();
    await database().prepare(`INSERT INTO work_note_attachments
      (user_email, local_id, owner_kind, owner_local_id, storage_key,
        storage_provider, drive_file_id, drive_folder_id, file_name,
        display_file_name, mime_type, extension, file_size, sha256,
        upload_status, preview_available, uploaded_by, metadata_json,
        migration_json, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, '', 'google_drive', ?, ?, ?, ?, ?, ?, ?, ?,
        'completed', ?, ?, ?, '{}', ?, ?, NULL)
      ON CONFLICT(user_email, local_id) DO UPDATE SET
        owner_kind = excluded.owner_kind, owner_local_id = excluded.owner_local_id,
        storage_provider = excluded.storage_provider, drive_file_id = excluded.drive_file_id,
        drive_folder_id = excluded.drive_folder_id, file_name = excluded.file_name,
        display_file_name = excluded.display_file_name, mime_type = excluded.mime_type,
        extension = excluded.extension, file_size = excluded.file_size,
        sha256 = excluded.sha256, upload_status = excluded.upload_status,
        preview_available = excluded.preview_available, uploaded_by = excluded.uploaded_by,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at,
        deleted_at = NULL`)
      .bind(email, id, ownerKind, ownerLocalId, uploadedDriveFileId,
        stored.driveFolderId || folderId, originalName, originalName, mimeType,
        extension, String(file.size), String(metadata.sha256 || "") || null,
        stored.previewAvailable ? 1 : 0, email, JSON.stringify(safeMetadata),
        uploadedAt, now)
      .run();
    return Response.json({ ok: true, id, storageProvider: "google_drive",
      driveFileId: uploadedDriveFileId, driveFolderId: stored.driveFolderId || folderId,
      uploadStatus: "completed", previewAvailable: stored.previewAvailable, updatedAt: now });
  } catch (error) {
    if (uploadedDriveFileId && !replacingExistingDriveFile && email) {
      try { await trashDriveFile(email, uploadedDriveFileId); }
      catch (cleanupError) {
        try {
          await database().prepare(`INSERT INTO work_note_file_recovery
            (id, user_email, local_id, drive_file_id, issue_type, payload, created_at, resolved_at)
            VALUES (?, ?, ?, ?, 'orphan_after_db_failure', ?, ?, NULL)`)
            .bind(crypto.randomUUID(), email, id, uploadedDriveFileId,
              JSON.stringify({ error: error instanceof Error ? error.message : String(error),
                cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }),
              new Date().toISOString()).run();
        } catch { /* Preserve the original error. */ }
      }
    }
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function PATCH(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    const payload = await request.json() as { id?: string; fileName?: string; ownerKind?: string; ownerLocalId?: string; category?: string; sentDate?: string; memo?: string };
    const id = String(payload.id || "");
    const row = await findAttachment(email, id);
    if (!row) return jsonError("첨부파일을 찾을 수 없습니다.", 404, "FILE_NOT_FOUND");
    let reference = fileReference(row);
    const nextName = payload.fileName ? cleanName(payload.fileName) : reference.fileName;
    if (nextName !== reference.fileName) {
      reference = await storageProvider(row.storage_provider).renameFile(email, reference, nextName);
    }
    const currentMetadata = parseMetadata(row.metadata_json);
    const ownerKind = String(payload.ownerKind || currentMetadata.ownerType || "unknown");
    const ownerLocalId = String(payload.ownerLocalId || currentMetadata.ownerId || "");
    const nextMetadata = {
      ...currentMetadata,
      ...(payload.fileName ? { fileName: nextName, name: nextName } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {}),
      ...(payload.sentDate !== undefined ? { sentDate: payload.sentDate } : {}),
      ...(payload.memo !== undefined ? { memo: payload.memo } : {}),
      ownerType: ownerKind,
      ownerId: ownerLocalId,
    };
    if (row.storage_provider === "google_drive" && (payload.ownerKind || payload.ownerLocalId)) {
      const folderId = await ensureAttachmentFolder(email, ownerKind, ownerLocalId, row.created_at || new Date().toISOString());
      reference = await storageProvider("google_drive").moveFile(email, reference, folderId);
    }
    await database().prepare(`UPDATE work_note_attachments SET display_file_name = ?,
      owner_kind = ?, owner_local_id = ?, drive_folder_id = ?, metadata_json = ?, updated_at = ?
      WHERE user_email = ? AND local_id = ?`)
      .bind(nextName, ownerKind, ownerLocalId, reference.driveFolderId || row.drive_folder_id || "",
        JSON.stringify(nextMetadata), new Date().toISOString(), email, id).run();
    return Response.json({ ok: true, id, fileName: nextName, driveFolderId: reference.driveFolderId || "" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const email = await currentUserEmail();
    if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401, "AUTH_REQUIRED");
    await ensureSchema();
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return jsonError("첨부파일 ID가 필요합니다.", 400);
    const row = await findAttachment(email, id);
    if (row) await storageProvider(row.storage_provider).deleteFile(email, fileReference(row));
    const now = new Date().toISOString();
    await database().prepare(`UPDATE work_note_attachments SET upload_status = 'deleted',
      deleted_at = ?, updated_at = ? WHERE user_email = ? AND local_id = ?`)
      .bind(now, now, email, id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
