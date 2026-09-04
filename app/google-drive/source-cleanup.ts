import { database, fileBucket } from "@/db/runtime";
import { getDriveFileMetadata } from "./files";
import { acquireDriveOperationLock, releaseDriveOperationLock } from "./managed-folders";
import { releaseVerifiedSource, type SourceCleanupResult } from "./source-cleanup-policy";

type SourceRow = {
  local_id: string; storage_provider: string; sync_status: string;
  drive_file_id: string; file_size: string; source_storage_key: string;
  storage_key: string; upload_session_id: string;
};

async function findSource(email: string, id: string) {
  return database().prepare(`SELECT local_id, storage_provider, sync_status, drive_file_id,
    file_size, source_storage_key, storage_key, upload_session_id FROM work_note_attachments
    WHERE user_email = ? AND local_id = ? AND deleted_at IS NULL`)
    .bind(email, id).first<SourceRow>();
}

export async function releaseSyncedSource(
  email: string, id: string, lockedSessionId = "",
): Promise<SourceCleanupResult> {
  let lockKey = "";
  let token = "";
  try {
    const initial = await findSource(email, id);
    if (!initial || initial.storage_provider !== "google_drive" || !["synced", "completed", "동기화 완료"].includes(initial.sync_status)) {
      return { status: "skipped", bytes: 0 };
    }
    // Share the upload session lock with retries; finalization already holds that lock.
    if (!lockedSessionId || lockedSessionId !== initial.upload_session_id) {
      lockKey = initial.upload_session_id
        ? `upload-session:${initial.upload_session_id}` : `source-cleanup:${id}`;
      token = await acquireDriveOperationLock(email, lockKey);
    }
    const row = await findSource(email, id);
    if (!row || row.upload_session_id !== initial.upload_session_id) return { status: "skipped", bytes: 0 };
    const keys = [...new Set([row.source_storage_key, row.storage_key].filter(Boolean))];
    let bytes = 0;
    let status: SourceCleanupResult["status"] = "skipped";
    for (const key of keys) {
      const result = await releaseVerifiedSource({
        provider: row.storage_provider, syncStatus: row.sync_status,
        driveFileId: row.drive_file_id, fileSize: Number(row.file_size),
      }, {
        driveMetadata: () => getDriveFileMetadata(email, row.drive_file_id),
        sourceHead: () => fileBucket().head(key),
        stillEligible: async () => {
          const current = await findSource(email, id);
          if (!current || current.storage_provider !== "google_drive" || !["synced", "completed", "동기화 완료"].includes(current.sync_status)
            || current.drive_file_id !== row.drive_file_id || current.file_size !== row.file_size
            || current.upload_session_id !== row.upload_session_id
            || (current.source_storage_key !== key && current.storage_key !== key)) return false;
          // Never remove another attachment's bytes, or a source needed by an unfinished upload.
          const shared = await database().prepare(`SELECT 1 AS found FROM work_note_attachments
            WHERE (source_storage_key = ? OR storage_key = ?)
              AND NOT (user_email = ? AND local_id = ?) LIMIT 1`)
            .bind(key, key, email, id).first();
          const active = await database().prepare(`SELECT 1 AS found FROM work_note_upload_sessions
            WHERE source_key = ? AND status NOT IN ('synced', 'aborted') LIMIT 1`)
            .bind(key).first();
          return !shared && !active;
        },
        deleteSource: () => fileBucket().delete(key),
        markReleased: async () => {
          await database().batch([
            database().prepare(`UPDATE work_note_attachments SET
              source_status = CASE WHEN source_storage_key = ? OR source_storage_key = '' THEN 'released' ELSE source_status END,
              source_storage_key = CASE WHEN source_storage_key = ? THEN '' ELSE source_storage_key END,
              storage_key = CASE WHEN storage_key = ? THEN '' ELSE storage_key END
              WHERE user_email = ? AND local_id = ? AND storage_provider = 'google_drive'
                AND sync_status IN ('synced', 'completed', '동기화 완료') AND drive_file_id = ? AND upload_session_id = ?`)
              .bind(key, key, key, email, id, row.drive_file_id, row.upload_session_id),
            database().prepare(`UPDATE work_note_upload_sessions SET source_status = 'released',
              source_key = '', r2_upload_id = '', encrypted_drive_session_uri = ''
              WHERE user_email = ? AND attachment_id = ? AND source_key = ? AND status = 'synced'`)
              .bind(email, id, key),
          ]);
        },
      });
      bytes += result.bytes;
      if (result.status === "failed") status = "failed";
      else if (result.status === "released" && status !== "failed") status = "released";
    }
    return { status, bytes };
  } catch {
    return { status: "failed", bytes: 0 };
  } finally {
    if (token) await releaseDriveOperationLock(email, lockKey, token).catch(() => undefined);
  }
}
