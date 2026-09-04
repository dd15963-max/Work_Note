import { database, ensureSchema } from "@/db/runtime";
import { getSiteUser } from "@/app/site-user";
import { getDriveConnection } from "@/app/google-drive/auth";
import { releaseSyncedSource } from "@/app/google-drive/source-cleanup";

export async function POST(request: Request) {
  const user = await getSiteUser();
  const email = user?.email.trim().toLowerCase();
  if (!email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  try {
    const payload = await request.json() as { confirmed?: boolean; cursor?: string };
    if (payload.confirmed !== true) return Response.json({ error: "사이트 원본 정리 확인이 필요합니다." }, { status: 400 });
    await ensureSchema();
    if (!await getDriveConnection(email)) return Response.json({ error: "Google Drive를 먼저 다시 연결해 주세요." }, { status: 409 });
    const cursor = String(payload.cursor || "").slice(0, 180);
    const rows = await database().prepare(`SELECT local_id FROM work_note_attachments
      WHERE user_email = ? AND deleted_at IS NULL AND storage_provider = 'google_drive'
        AND sync_status IN ('synced', 'completed', '동기화 완료') AND COALESCE(drive_file_id, '') <> ''
        AND (source_storage_key <> '' OR storage_key <> '') AND local_id > ?
      ORDER BY local_id LIMIT 6`).bind(email, cursor).all<{ local_id: string }>();
    const batch = rows.results.slice(0, 5);
    const result = { released: 0, skipped: 0, failed: 0, bytes: 0, hasMore: rows.results.length > 5, cursor };
    for (const row of batch) {
      const cleaned = await releaseSyncedSource(email, row.local_id);
      result[cleaned.status] += 1;
      result.bytes += cleaned.bytes;
      result.cursor = row.local_id;
    }
    return Response.json(result);
  } catch {
    return Response.json({ error: "사이트 원본 정리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요. Drive 파일은 삭제하지 않습니다." }, { status: 500 });
  }
}
