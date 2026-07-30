import { database, ensureSchema } from "@/db/runtime";
import { getDriveConnection } from "@/app/google-drive/auth";
import {
  ensureManagedAttachmentFolders,
  loadWorkNoteDataset,
  logDriveOperation,
  previewAttachmentOrganization,
} from "@/app/google-drive/managed-folders";
import { buildDrivePath, driveFileUrl, resolveAttachmentOwnerContext } from "@/app/google-drive/organization";
import { getDriveFileMetadata, trashDriveFile } from "@/app/google-drive/files";
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

function parseMetadata(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

async function userEmail() {
  const user = await getSiteUser();
  return user?.email.trim().toLowerCase() || "";
}

export async function GET(request: Request) {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
  await ensureSchema();
  const url = new URL(request.url);
  if (url.searchParams.get("preview") === "1") {
    return Response.json(await previewAttachmentOrganization(email));
  }
  const row = await database().prepare(`SELECT COUNT(*) AS count
    FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
    AND deleted_at IS NULL`).bind(email).first<{ count: number }>();
  const organization = await previewAttachmentOrganization(email);
  return Response.json({
    legacyFileCount: Number(row?.count || 0),
    organizationMoveCount: organization.moveRequired,
  });
}

export async function POST(request: Request) {
  const email = await userEmail();
  if (!email) return jsonError("ChatGPT 로그인이 필요합니다.", 401);
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
          AND deleted_at IS NULL AND local_id IN (${ids.map(() => "?").join(",")}) LIMIT 25`
      : `SELECT local_id, owner_kind, owner_local_id, storage_key, file_name,
          display_file_name, mime_type, file_size, metadata_json, created_at
        FROM work_note_attachments WHERE user_email = ? AND storage_provider = 'site_storage'
          AND deleted_at IS NULL ORDER BY updated_at ASC LIMIT 25`;
    const rows = await database().prepare(query).bind(email, ...ids).all<LegacyRow>();
    const dataset = await loadWorkNoteDataset(email);
    const results: Array<{ id: string; ok: boolean; error?: string; path?: string }> = [];
    for (const row of rows.results) {
      let driveFileId = "";
      try {
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
        const folders = await ensureManagedAttachmentFolders(email, context);
        const legacyRef: StoredFileReference = {
          provider: "site_storage",
          storageKey: row.storage_key,
          fileName: row.display_file_name || row.file_name,
          mimeType: row.mime_type,
          fileSize: Number(row.file_size || 0),
        };
        const source = await storageProvider("site_storage").downloadFile(email, legacyRef);
        const stored = await storageProvider("google_drive").uploadFile({
          userEmail: email,
          fileName: legacyRef.fileName,
          mimeType: legacyRef.mimeType,
          fileSize: legacyRef.fileSize,
          body: source.body!,
          folderId: folders.categoryFolderId,
        });
        driveFileId = stored.driveFileId || "";
        const verified = await getDriveFileMetadata(email, driveFileId);
        if (Number(verified.size || 0) !== legacyRef.fileSize) {
          throw new Error("이전 후 파일 크기가 일치하지 않습니다.");
        }
        const now = new Date().toISOString();
        const drivePath = buildDrivePath(context, legacyRef.fileName);
        const nextMetadata = {
          ...metadata,
          storageProvider: "google_drive",
          driveFileId,
          driveFolderId: folders.categoryFolderId,
          driveCompanyFolderId: folders.companyFolderId,
          driveMemoFolderId: folders.memoFolderId,
          driveCategoryFolderId: folders.categoryFolderId,
          drivePath,
          driveWebViewLink: verified.webViewLink || driveFileUrl(driveFileId),
          driveMemoFolderUrl: folders.memoFolderUrl,
          category: context.category,
          syncStatus: "동기화 완료",
          lastSyncedAt: now,
        };
        await database().prepare(`UPDATE work_note_attachments SET
          storage_provider = 'google_drive', drive_file_id = ?, drive_folder_id = ?,
          drive_company_folder_id = ?, drive_memo_folder_id = ?,
          drive_category_folder_id = ?, drive_path = ?, drive_web_view_link = ?,
          file_category = ?, upload_status = 'completed', preview_available = ?,
          metadata_json = ?, migration_json = ?, sync_status = '동기화 완료',
          last_synced_at = ?, last_error = '', updated_at = ?
          WHERE user_email = ? AND local_id = ? AND storage_provider = 'site_storage'`)
          .bind(
            driveFileId, folders.categoryFolderId, folders.companyFolderId,
            folders.memoFolderId, folders.categoryFolderId, drivePath,
            verified.webViewLink || driveFileUrl(driveFileId), context.category,
            stored.previewAvailable ? 1 : 0, JSON.stringify(nextMetadata),
            JSON.stringify({ migratedAt: now, legacyStorageKey: row.storage_key, legacyRetained: true }),
            now, now, email, row.local_id,
          ).run();
        await logDriveOperation(email, {
          operationType: "migration",
          targetId: driveFileId,
          afterPath: drivePath,
          status: "completed",
          payload: { localId: row.local_id, legacyRetained: true },
        });
        results.push({ id: row.local_id, ok: true, path: drivePath });
      } catch (error) {
        if (driveFileId) {
          try { await trashDriveFile(email, driveFileId); } catch { /* Keep legacy original. */ }
        }
        const message = error instanceof Error ? error.message : String(error);
        await logDriveOperation(email, {
          operationType: "migration",
          targetId: driveFileId || row.local_id,
          status: "retry_required",
          errorMessage: message,
        });
        results.push({ id: row.local_id, ok: false, error: message });
      }
    }
    const remaining = await database().prepare(`SELECT COUNT(*) AS count FROM work_note_attachments
      WHERE user_email = ? AND storage_provider = 'site_storage' AND deleted_at IS NULL`)
      .bind(email).first<{ count: number }>();
    return Response.json({
      ok: results.every((result) => result.ok),
      results,
      migrated: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      remaining: Number(remaining?.count || 0),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error));
  }
}
