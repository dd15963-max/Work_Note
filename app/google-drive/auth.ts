import { env } from "cloudflare:workers";
import { database, ensureSchema } from "@/db/runtime";
import { decryptSecret, encryptSecret } from "./crypto";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const IDENTITY_SCOPES = "openid email";

export type GoogleDriveConnection = {
  userEmail: string;
  googleEmail: string;
  encryptedRefreshToken: string;
  encryptedAccessToken: string;
  accessTokenExpiresAt: string;
  scope: string;
  rootFolderId: string;
  rootFolderName: string;
  connectedAt: string;
  lastSyncedAt: string;
  updatedAt: string;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export class GoogleDriveHttpError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly retryAfter: string;

  constructor(message: string, status: number, reason = "", retryAfter = "") {
    super(message);
    this.name = "GoogleDriveHttpError";
    this.status = status;
    this.reason = reason;
    this.retryAfter = retryAfter;
  }
}

type ConnectionRow = {
  user_email: string;
  google_email: string;
  encrypted_refresh_token: string;
  encrypted_access_token: string;
  access_token_expires_at: string;
  scope: string;
  root_folder_id: string;
  root_folder_name: string;
  connected_at: string;
  last_synced_at: string;
  updated_at: string;
};

function oauthConfig() {
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.GOOGLE_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Drive OAuth 환경변수가 아직 설정되지 않았습니다.");
  }
  return { clientId, clientSecret, redirectUri };
}

function fromRow(row: ConnectionRow): GoogleDriveConnection {
  return {
    userEmail: row.user_email,
    googleEmail: row.google_email,
    encryptedRefreshToken: row.encrypted_refresh_token,
    encryptedAccessToken: row.encrypted_access_token,
    accessTokenExpiresAt: row.access_token_expires_at,
    scope: row.scope,
    rootFolderId: row.root_folder_id,
    rootFolderName: row.root_folder_name,
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
  };
}

export async function getDriveConnection(userEmail: string): Promise<GoogleDriveConnection | null> {
  await ensureSchema();
  const row = await database().prepare(`SELECT user_email, google_email,
    encrypted_refresh_token, encrypted_access_token, access_token_expires_at,
    scope, root_folder_id, root_folder_name, connected_at, last_synced_at,
    updated_at FROM work_note_google_drive_connections
    WHERE user_email = ? AND disconnected_at IS NULL`)
    .bind(userEmail)
    .first<ConnectionRow>();
  return row ? fromRow(row) : null;
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createAuthorizationUrl(userEmail: string, returnTo: string): Promise<string> {
  await ensureSchema();
  const { clientId, redirectUri } = oauthConfig();
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const now = new Date();
  await database().prepare(`INSERT INTO work_note_google_oauth_states
    (state, user_email, code_verifier, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(state, userEmail, codeVerifier, safeReturnTo(returnTo), now.toISOString(),
      new Date(now.getTime() + 10 * 60 * 1000).toISOString())
    .run();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${IDENTITY_SCOPES} ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: await sha256Base64Url(codeVerifier),
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function consumeOauthState(state: string) {
  await ensureSchema();
  const row = await database().prepare(`SELECT user_email, code_verifier,
    return_to, expires_at FROM work_note_google_oauth_states WHERE state = ?`)
    .bind(state)
    .first<{ user_email: string; code_verifier: string; return_to: string; expires_at: string }>();
  if (!row) throw new Error("Google Drive 연결 요청을 찾을 수 없습니다.");
  await database().prepare("DELETE FROM work_note_google_oauth_states WHERE state = ?").bind(state).run();
  if (row.expires_at < new Date().toISOString()) {
    throw new Error("Google Drive 연결 요청이 만료되었습니다. 다시 시도해 주세요.");
  }
  return { userEmail: row.user_email, codeVerifier: row.code_verifier, returnTo: safeReturnTo(row.return_to) };
}

export async function googleError(response: Response): Promise<Error> {
  let message = `Google Drive 요청 실패 (${response.status})`;
  let reason = "";
  try {
    const payload = await response.json() as {
      error?: string | {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string; message?: string }>;
      };
      error_description?: string;
    };
    if (typeof payload.error === "object" && payload.error?.message) {
      message = payload.error.message;
      reason = String(payload.error.errors?.[0]?.reason || payload.error.status || "");
    }
    else if (payload.error_description) message = payload.error_description;
    else if (typeof payload.error === "string") message = payload.error;
  } catch { /* Keep status message. */ }
  if (response.status === 401) message = "Google Drive 인증이 만료되었습니다. 다시 연결해 주세요.";
  else if (response.status === 403 && /storage|quota/i.test(message)) message = "Google Drive 저장 공간이 부족합니다.";
  else if (response.status === 404) message = "Google Drive에서 해당 파일을 찾을 수 없습니다.";
  else if (response.status === 429) message = "Google Drive 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return new GoogleDriveHttpError(message, response.status, reason, response.headers.get("Retry-After") || "");
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier }),
  });
  if (!response.ok) throw await googleError(response);
  return response.json() as Promise<TokenResponse>;
}

export async function googleAccountEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await googleError(response);
  const payload = await response.json() as { email?: string };
  if (!payload.email) throw new Error("연결된 Google 계정 이메일을 확인하지 못했습니다.");
  return payload.email.trim().toLowerCase();
}

export async function saveDriveConnection(
  userEmail: string,
  googleEmail: string,
  tokens: TokenResponse,
): Promise<GoogleDriveConnection> {
  const existing = await getDriveConnection(userEmail);
  const stored = await database().prepare(`SELECT google_email, root_folder_id,
    root_folder_name, connected_at, last_synced_at
    FROM work_note_google_drive_connections WHERE user_email = ?`)
    .bind(userEmail)
    .first<Pick<ConnectionRow, "google_email" | "root_folder_id" | "root_folder_name" | "connected_at" | "last_synced_at">>();
  const refreshToken = tokens.refresh_token
    ? await encryptSecret(tokens.refresh_token)
    : existing?.encryptedRefreshToken || "";
  if (!refreshToken) throw new Error("Google 갱신 토큰을 받지 못했습니다. 연결을 다시 시도해 주세요.");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000).toISOString();
  await database().prepare(`INSERT INTO work_note_google_drive_connections
    (user_email, google_email, encrypted_refresh_token, encrypted_access_token,
      access_token_expires_at, scope, root_folder_id, root_folder_name,
      connected_at, last_synced_at, updated_at, disconnected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(user_email) DO UPDATE SET google_email = excluded.google_email,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      encrypted_access_token = excluded.encrypted_access_token,
      access_token_expires_at = excluded.access_token_expires_at,
      scope = excluded.scope, updated_at = excluded.updated_at, disconnected_at = NULL`)
    .bind(userEmail, googleEmail, refreshToken, await encryptSecret(tokens.access_token), expiresAt,
      tokens.scope || `${IDENTITY_SCOPES} ${DRIVE_SCOPE}`,
      stored?.google_email === googleEmail ? stored.root_folder_id : "",
      stored?.google_email === googleEmail ? stored.root_folder_name || "Work Note" : "Work Note",
      stored?.connected_at || now.toISOString(), stored?.last_synced_at || "", now.toISOString())
    .run();
  return (await getDriveConnection(userEmail))!;
}

async function cacheAccessToken(userEmail: string, token: TokenResponse): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, Number(token.expires_in || 3600) - 60) * 1000).toISOString();
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET encrypted_access_token = ?, access_token_expires_at = ?, updated_at = ?
    WHERE user_email = ?`)
    .bind(await encryptSecret(token.access_token), expiresAt, now.toISOString(), userEmail).run();
  return token.access_token;
}

export async function accessTokenForUser(userEmail: string): Promise<string> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) throw new Error("Google Drive 연결이 필요합니다.");
  if (connection.encryptedAccessToken && connection.accessTokenExpiresAt > new Date().toISOString()) {
    return decryptSecret(connection.encryptedAccessToken);
  }
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
      refresh_token: await decryptSecret(connection.encryptedRefreshToken), grant_type: "refresh_token" }),
  });
  if (!response.ok) throw await googleError(response);
  return cacheAccessToken(userEmail, await response.json() as TokenResponse);
}

export async function invalidateDriveAccessToken(userEmail: string): Promise<void> {
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET encrypted_access_token = '', access_token_expires_at = '' WHERE user_email = ?`)
    .bind(userEmail).run();
}

async function recordSuccessfulDriveRequest(userEmail: string): Promise<void> {
  const now = new Date().toISOString();
  await database().prepare(`UPDATE work_note_google_drive_connections
    SET last_synced_at = ?, updated_at = ? WHERE user_email = ?`)
    .bind(now, now, userEmail).run();
}

/**
 * Performs exactly one authenticated request and never replays the body.
 * Use this for resumable upload chunks because a ReadableStream is consumable once.
 */
export async function driveFetchOnce(userEmail: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessTokenForUser(userEmail)}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) await invalidateDriveAccessToken(userEmail);
  if (response.ok || response.status === 308) await recordSuccessfulDriveRequest(userEmail);
  return response;
}

function bodyCanBeReplayed(body: BodyInit | null | undefined): boolean {
  if (body == null || typeof body === "string" || body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof Blob) return true;
  return false;
}

export async function driveFetch(userEmail: string, url: string, init: RequestInit = {}): Promise<Response> {
  let last: Response | null = null;
  const replayable = bodyCanBeReplayed(init.body);
  for (let attempt = 0; attempt < (replayable ? 3 : 1); attempt += 1) {
    const response = await driveFetchOnce(userEmail, url, init);
    if (response.ok) {
      return response;
    }
    last = response;
    if (response.status === 401 && attempt === 0) {
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw await googleError(last!);
}

export async function disconnectDrive(userEmail: string): Promise<void> {
  const connection = await getDriveConnection(userEmail);
  if (!connection) return;
  try {
    const refreshToken = await decryptSecret(connection.encryptedRefreshToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  } catch { /* Local disconnection still succeeds. */ }
  const now = new Date().toISOString();
  await database().batch([
    database().prepare(`UPDATE work_note_google_drive_connections
      SET encrypted_refresh_token = '', encrypted_access_token = '',
        access_token_expires_at = '', disconnected_at = ?, updated_at = ? WHERE user_email = ?`)
      .bind(now, now, userEmail),
    database().prepare(`UPDATE work_note_upload_sessions
      SET encrypted_drive_session_uri = '', drive_session_created_at = '',
        confirmed_bytes = 0, current_chunk = 0,
        status = CASE WHEN source_status = 'available' THEN 'retry_required' ELSE status END,
        updated_at = ? WHERE user_email = ? AND status <> 'synced'`)
      .bind(now, userEmail),
  ]);
}
