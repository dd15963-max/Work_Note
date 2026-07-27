import { env } from "cloudflare:workers";

export function database(): D1Database {
  if (!env.DB) throw new Error("Work Note 데이터베이스가 연결되지 않았습니다.");
  return env.DB;
}

export function fileBucket(): R2Bucket {
  if (!env.FILES) throw new Error("Work Note 파일 저장소가 연결되지 않았습니다.");
  return env.FILES;
}

export async function ensureSchema(): Promise<void> {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_datasets (
      user_email TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      data_version TEXT NOT NULL DEFAULT 'sites-work-note-v1',
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_attachments (
      user_email TEXT NOT NULL,
      local_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL DEFAULT 'unknown',
      owner_local_id TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size TEXT NOT NULL DEFAULT '0',
      sha256 TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (user_email, local_id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_attachments_owner_idx
      ON work_note_attachments(user_email, owner_kind, owner_local_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_migration_logs (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_migration_logs_user_idx
      ON work_note_migration_logs(user_email)`),
  ]);
}

export function emptyDataset() {
  return {
    version: "sites-work-note-v1",
    updatedAt: "",
    companies: [],
    internalContacts: [],
    notes: [],
    materialSalesNotes: [],
    settlementTasks: [],
    outputTasks: [],
    otherTasks: [],
    accounts: [],
  };
}
