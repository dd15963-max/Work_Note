import { driveStorageQuota, ensureRootFolders } from "@/app/google-drive/files";
import { getSiteUser } from "@/app/site-user";

export async function POST() {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  const email = user.email.trim().toLowerCase();
  try {
    const rootFolderId = await ensureRootFolders(email);
    const about = await driveStorageQuota(email);
    return Response.json({ ok: true, rootFolderId, googleEmail: about.user?.emailAddress || "" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
