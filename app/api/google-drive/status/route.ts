import { getDriveConnection } from "@/app/google-drive/auth";
import { driveStorageQuota, rootFolderUrl } from "@/app/google-drive/files";
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
    const counts = await database().prepare(`SELECT
      SUM(CASE WHEN storage_provider = 'google_drive' THEN 1 ELSE 0 END) AS drive_count,
      SUM(CASE WHEN storage_provider = 'site_storage' THEN 1 ELSE 0 END) AS legacy_count
      FROM work_note_attachments WHERE user_email = ? AND deleted_at IS NULL`)
      .bind(email).first<{ drive_count: number; legacy_count: number }>();
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
      driveFileCount: Number(counts?.drive_count || 0),
      legacyFileCount: Number(counts?.legacy_count || 0),
      quota: quota?.storageQuota || null,
    });
  } catch (error) {
    return Response.json({ connected: false, provider: "google_drive", error: error instanceof Error ? error.message : String(error) });
  }
}
