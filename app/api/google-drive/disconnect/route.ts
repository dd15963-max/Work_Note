import { disconnectDrive } from "@/app/google-drive/auth";
import { getSiteUser } from "@/app/site-user";

export async function DELETE() {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  try {
    await disconnectDrive(user.email.trim().toLowerCase());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
