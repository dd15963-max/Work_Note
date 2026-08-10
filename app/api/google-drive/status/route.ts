import { getDriveConnection } from "@/app/google-drive/auth";
import { driveStorageQuota, rootFolderUrl } from "@/app/google-drive/files";
import {
  latestTimestamp,
  summarizeAttachmentRows,
  summarizeFolderRows,
  summarizeOperationRows,
  type DriveStatusAttachmentRow,
  type DriveStatusFolderRow,
  type DriveStatusOperationRow,
} from "@/app/google-drive/status-contract";
import { getSiteUser } from "@/app/site-user";
import { database, ensureSchema } from "@/db/runtime";

export async function GET() {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  const email = user.email.trim().toLowerCase();
  try {
    await ensureSchema();
    const connection = await getDriveConnection(email);
    if (!connection) return Response.json({ connected: false, provider: "google_drive" });

    const [attachmentResult, folderResult, operationResult] = await Promise.allSettled([
      database().prepare(`SELECT storage_provider, drive_file_id,
        drive_company_folder_id, drive_memo_folder_id, drive_category_folder_id,
        drive_path, sync_status, upload_status, last_synced_at
        FROM work_note_attachments
        WHERE user_email = ? AND deleted_at IS NULL`)
        .bind(email).all<DriveStatusAttachmentRow>(),
      database().prepare(`SELECT folder_id, folder_name, managed_key, folder_type,
        last_synced_at FROM work_note_drive_folders
        WHERE user_email = ? AND trashed_at IS NULL`)
        .bind(email).all<DriveStatusFolderRow>(),
      database().prepare(`SELECT operation_type, status, updated_at
        FROM work_note_drive_operations WHERE user_email = ? AND (
          operation_type = 'duplicate_folder_merge_batch' OR
          operation_type IN (
            'empty_folder_cleanup', 'duplicate_folder_cleanup', 'dataset_sync',
            'file_upload', 'file_upload_adopt', 'file_replace', 'file_move',
            'duplicate_file_move', 'migration', 'migration_adopt'
          )
        )`).bind(email).all<DriveStatusOperationRow>(),
    ]);

    const metrics: Record<string, unknown> = {};
    let lastAttachmentSyncAt = "";
    let lastOperationSyncAt = "";
    if (attachmentResult.status === "fulfilled") {
      const summary = summarizeAttachmentRows(attachmentResult.value.results);
      const { lastAttachmentSyncAt: lastSync, ...attachmentMetrics } = summary;
      Object.assign(metrics, attachmentMetrics);
      lastAttachmentSyncAt = lastSync;
    }
    if (folderResult.status === "fulfilled") {
      Object.assign(metrics, summarizeFolderRows(folderResult.value.results));
    }
    if (operationResult.status === "fulfilled") {
      const summary = summarizeOperationRows(operationResult.value.results);
      const { lastOperationSyncAt: lastSync, ...operationMetrics } = summary;
      Object.assign(metrics, operationMetrics);
      lastOperationSyncAt = lastSync;
    }
    const lastDriveSyncAt = latestTimestamp(
      connection.lastSyncedAt,
      lastAttachmentSyncAt,
      lastOperationSyncAt,
    );
    if (lastDriveSyncAt) metrics.lastDriveSyncAt = lastDriveSyncAt;

    let quota: Record<string, unknown> | null = null;
    try { quota = await driveStorageQuota(email); } catch { quota = null; }
    return Response.json({
      connected: true,
      provider: "google_drive",
      googleEmail: connection.googleEmail,
      rootFolderId: connection.rootFolderId,
      rootFolderName: connection.rootFolderName,
      rootFolderUrl: rootFolderUrl(connection.rootFolderId),
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      ...metrics,
      quota: quota?.storageQuota || null,
    });
  } catch (error) {
    return Response.json({
      connected: false,
      provider: "google_drive",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
