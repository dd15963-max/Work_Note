import { testTeamShareConnection } from "@/app/google-sheets/team-share";
import { getSiteUser } from "@/app/site-user";

export async function POST() {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  try {
    const settings = await testTeamShareConnection(user.email.trim().toLowerCase());
    return Response.json({ ok: true, settings });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
