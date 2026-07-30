import { env } from "cloudflare:workers";

let schemaPromise: Promise<void> | null = null;

export function database(): D1Database {
  if (!env.DB) throw new Error("Work Note 데이터베이스가 연결되지 않았습니다.");
  return env.DB;
}

export function fileBucket(): R2Bucket {
  if (!env.FILES) throw new Error("Work Note 기존 파일 저장소가 연결되지 않았습니다.");
  return env.FILES;
}

export async function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = ensureSchemaInner().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function ensureSchemaInner(): Promise<void> {
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
      storage_provider TEXT NOT NULL DEFAULT 'site_storage',
      drive_file_id TEXT,
      drive_folder_id TEXT,
      file_name TEXT NOT NULL,
      display_file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL DEFAULT '',
      file_size TEXT NOT NULL DEFAULT '0',
      sha256 TEXT,
      upload_status TEXT NOT NULL DEFAULT 'completed',
      preview_available INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      migration_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (user_email, local_id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_attachments_owner_idx
      ON work_note_attachments(user_email, owner_kind, owner_local_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_google_drive_connections (
      user_email TEXT PRIMARY KEY,
      google_email TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      encrypted_access_token TEXT NOT NULL DEFAULT '',
      access_token_expires_at TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      root_folder_id TEXT NOT NULL DEFAULT '',
      root_folder_name TEXT NOT NULL DEFAULT 'Work Note',
      connected_at TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      disconnected_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_google_oauth_states (
      state TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_google_oauth_states_user_idx
      ON work_note_google_oauth_states(user_email)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_file_recovery (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      local_id TEXT NOT NULL DEFAULT '',
      drive_file_id TEXT NOT NULL DEFAULT '',
      issue_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_file_recovery_user_idx
      ON work_note_file_recovery(user_email)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_migration_logs (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_migration_logs_user_idx
      ON work_note_migration_logs(user_email)`),
  ]);

  const columns: Array<[string, string]> = [
    ["storage_provider", "TEXT NOT NULL DEFAULT 'site_storage'"],
    ["drive_file_id", "TEXT"],
    ["drive_folder_id", "TEXT"],
    ["display_file_name", "TEXT NOT NULL DEFAULT ''"],
    ["extension", "TEXT NOT NULL DEFAULT ''"],
    ["upload_status", "TEXT NOT NULL DEFAULT 'completed'"],
    ["preview_available", "INTEGER NOT NULL DEFAULT 0"],
    ["uploaded_by", "TEXT NOT NULL DEFAULT ''"],
    ["migration_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
  ];
  const tableInfo = await db.prepare("PRAGMA table_info(work_note_attachments)").all<{ name: string }>();
  const existingColumns = new Set(tableInfo.results.map((column) => column.name));
  for (const [name, definition] of columns) {
    if (!existingColumns.has(name)) {
      await db.prepare(`ALTER TABLE work_note_attachments ADD COLUMN ${name} ${definition}`).run();
    }
  }
  await db.prepare(`UPDATE work_note_attachments SET storage_provider = 'site_storage'
    WHERE storage_provider IS NULL OR storage_provider = ''`).run();
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
