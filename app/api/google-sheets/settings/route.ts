import { getSiteUser } from "@/app/site-user";
import {
  getTeamShareSettings,
  saveTeamShareSettings,
} from "@/app/google-sheets/team-share";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  try {
    return Response.json(await getTeamShareSettings(user.email.trim().toLowerCase()));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json() as {
      spreadsheet?: string;
      sheetName?: string;
      displayName?: string;
    };
    const result = await saveTeamShareSettings(user.email.trim().toLowerCase(), {
      spreadsheet: String(body.spreadsheet || ""),
      sheetName: String(body.sheetName || ""),
      displayName: String(body.displayName || user.displayName || user.fullName || ""),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}
