import { database, ensureSchema } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import { ensureAttachmentFolder, getDriveFileMetadata, trashDriveFile } from "@/app/google-drive/files";
import { getSiteUser } from "@/app/site-user";
import { storageProvider, type StoredFileReference } from "@/app/storage/provider";

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

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

async function userEmail() {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || "";
}

export async function GET() {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  await ensureSchema();
  const row = await database().prepare(`SELECT COUNT(*) AS count
    FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
    AND deleted_at IS NULL`).bind(email).first<{ count: number }>();
  return Response.json({ legacyFileCount: Number(row?.count || 0) });
}

export async function POST(request: Request) {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  try {
    await ensureSchema();
    if (!await getDriveConnection(email)) return jsonError("Google Drive 연결이 필요합니다.", 409);
    const payload = await request.json().catch(() => ({})) as { ids?: string[] };
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String).filter(Boolean).slice(0, 25) : [];
    const query = ids.length
      ? `SELECT local_id, owner_kind, owner_local_id, storage_key, file_name,
          display_file_name, mime_type, file_size, metadata_json, created_at
        FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
          AND deleted_at IS NULL AND local_id IN (${ids.map(() => "?").join(",")}) LIMIT 25`
      : `SELECT local_id, owner_kind, owner_local_id, storage_key, file_name,
          display_file_name, mime_type, file_size, metadata_json, created_at
        FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
          AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT 25`;
    const rows = await database().prepare(query).bind(email, ...ids).all<LegacyRow>();
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const row of rows.results) {
      let driveFileId = "";
      try {
        const legacyRef: StoredFileReference = {
          provider: "site_storage",
          storageKey: row.storage_key,
          fileName: row.display_file_name || row.file_name,
          mimeType: row.mime_type,
          fileSize: Number(row.file_size || 0),
        };
        const source = await storageProvider("site_storage").downloadFile(email, legacyRef);
        const folderId = await ensureAttachmentFolder(email, row.owner_kind, row.owner_local_id,
          row.created_at || new Date().toISOString());
        const stored = await storageProvider("google_drive").uploadFile({
          userEmail: email,
          fileName: legacyRef.fileName,
          mimeType: legacyRef.mimeType,
          fileSize: legacyRef.fileSize,
          body: source.body!,
          folderId,
        });
        driveFileId = stored.driveFileId || "";
        const verified = await getDriveFileMetadata(email, driveFileId);
        if (Number(verified.size || 0) !== legacyRef.fileSize) {
          throw new Error("이전 후 파일 크기가 일치하지 않습니다.");
        }
        const now = new Date().toISOString();
        await database().prepare(`UPDATE work_note_attachments SET
          storage_provider = 'google_drive', drive_file_id = ?, drive_folder_id = ?,
          upload_status = 'completed', preview_available = ?, migration_json = ?, updated_at = ?
          WHERE user_email = ? AND local_id = ? AND storage_provider = 'site_storage'`)
          .bind(driveFileId, stored.driveFolderId || folderId, stored.previewAvailable ? 1 : 0,
            JSON.stringify({ migratedAt: now, legacyStorageKey: row.storage_key, legacyRetained: true }),
            now, email, row.local_id).run();
        results.push({ id: row.local_id, ok: true });
      } catch (error) {
        if (driveFileId) { try { await trashDriveFile(email, driveFileId); } catch { /* Keep legacy original. */ } }
        results.push({ id: row.local_id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const remaining = await database().prepare(`SELECT COUNT(*) AS count FROM work_note_attachments
      WHERE user_email = ? AND storage_provider = 'site_storage' AND deleted_at IS NULL`)
      .bind(email).first<{ count: number }>();
    return Response.json({ ok: results.every((result) => result.ok), results,
      migrated: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      remaining: Number(remaining?.count || 0) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
