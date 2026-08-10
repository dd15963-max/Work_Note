import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";

const authSource = readFileSync(new URL("../../../app/google-drive/auth.ts", import.meta.url), "utf8");
const activeMiniflares: Miniflare[] = [];

afterEach(async () => {
  await Promise.all(activeMiniflares.splice(0).map((instance) => instance.dispose()));
});

function reconnectSessionUpdateSql(): string {
  const start = authSource.indexOf("export async function markDriveReconnectReady");
  const end = authSource.indexOf("export async function disconnectDrive", start);
  const body = authSource.slice(start, end);
  const match = body.match(/database\(\)\.prepare\(`(UPDATE work_note_upload_sessions[\s\S]*?)`\)/);
  if (!match) throw new Error("Drive reconnect session UPDATE was not found");
  return match[1];
}

describe("Google Drive reconnect D1 state", () => {
  it("executes against the production upload-session columns and clears a stale reconnect error", async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: { DB: "work-note-reconnect-test" },
    });
    activeMiniflares.push(miniflare);
    const db = await miniflare.getD1Database("DB");

    await db.prepare(`CREATE TABLE work_note_upload_sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT NOT NULL DEFAULT '',
      user_message TEXT NOT NULL DEFAULT '',
      error_detail TEXT NOT NULL DEFAULT '',
      failure_stage TEXT NOT NULL DEFAULT '',
      auto_recoverable INTEGER NOT NULL DEFAULT 0,
      user_action_required INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`).run();
    await db.prepare(`INSERT INTO work_note_upload_sessions
      (id, user_email, status, error_code, user_message, error_detail, failure_stage, auto_recoverable, user_action_required, updated_at)
      VALUES (?, ?, 'reconnect_required', 'drive-invalid-grant', '재연결 필요', 'Token has been expired or revoked.', 'drive-init', 0, 1, ?)`)
      .bind("session-1", "owner@example.com", "2026-08-10T00:00:00.000Z")
      .run();

    const now = "2026-08-10T01:00:00.000Z";
    await db.prepare(reconnectSessionUpdateSql()).bind(now, "owner@example.com").run();
    const row = await db.prepare(`SELECT status, error_code, user_message, error_detail,
      failure_stage, auto_recoverable, user_action_required, updated_at
      FROM work_note_upload_sessions WHERE id = ?`).bind("session-1").first<Record<string, unknown>>();

    expect(row).toEqual({
      status: "retry_required",
      error_code: "",
      user_message: "",
      error_detail: "",
      failure_stage: "",
      auto_recoverable: 0,
      user_action_required: 0,
      updated_at: now,
    });
  });
});
