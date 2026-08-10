import {
  consumeOauthState,
  exchangeAuthorizationCode,
  googleAccountEmail,
  markDriveReconnectReady,
  saveDriveConnection,
} from "@/app/google-drive/auth";
import { ensureRootFolders } from "@/app/google-drive/files";
import { getSiteUser } from "@/app/site-user";

function redirectResult(request: Request, returnTo: string, key: string, value: string) {
  const target = new URL(returnTo || "/", request.url);
  target.searchParams.set(key, value);
  return Response.redirect(target.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state") || "";
  if (!stateValue) return redirectResult(request, "/", "driveError", "연결 상태값이 없습니다.");
  try {
    const state = await consumeOauthState(stateValue);
    const user = await getSiteUser();
    if (!user?.email || user.email.trim().toLowerCase() !== state.userEmail) {
      throw new Error("Google Drive 연결을 시작한 Work Note 계정과 현재 계정이 다릅니다.");
    }
    const oauthError = url.searchParams.get("error");
    if (oauthError) throw new Error("Google Drive 연결이 취소되었습니다.");
    const code = url.searchParams.get("code") || "";
    if (!code) throw new Error("Google 인증 코드를 받지 못했습니다.");
    const tokens = await exchangeAuthorizationCode(code, state.codeVerifier);
    const googleEmail = await googleAccountEmail(tokens.access_token);
    await saveDriveConnection(state.userEmail, googleEmail, tokens);
    await ensureRootFolders(state.userEmail);
    await markDriveReconnectReady(state.userEmail);
    return redirectResult(request, state.returnTo, "drive", "connected");
  } catch (error) {
    return redirectResult(request, "/", "driveError", error instanceof Error ? error.message : String(error));
  }
}
