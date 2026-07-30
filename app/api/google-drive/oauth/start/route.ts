import { createAuthorizationUrl } from "@/app/google-drive/auth";
import { getSiteUser } from "@/app/site-user";

export async function GET(request: Request) {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  const returnTo = new URL(request.url).searchParams.get("returnTo") || "/";
  try {
    return Response.redirect(await createAuthorizationUrl(user.email.trim().toLowerCase(), returnTo), 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
