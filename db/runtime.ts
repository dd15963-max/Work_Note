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
      drive_company_folder_id TEXT NOT NULL DEFAULT '',
      drive_memo_folder_id TEXT NOT NULL DEFAULT '',
      drive_category_folder_id TEXT NOT NULL DEFAULT '',
      drive_path TEXT NOT NULL DEFAULT '',
      drive_web_view_link TEXT NOT NULL DEFAULT '',
      file_category TEXT NOT NULL DEFAULT '기타',
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
      sync_status TEXT NOT NULL DEFAULT '동기화 완료',
      last_synced_at TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      operation_token TEXT NOT NULL DEFAULT '',
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
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_drive_folders (
      user_email TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      managed_key TEXT NOT NULL,
      parent_folder_id TEXT NOT NULL,
      folder_type TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      company_id TEXT NOT NULL DEFAULT '',
      memo_id TEXT NOT NULL DEFAULT '',
      file_category TEXT NOT NULL DEFAULT '',
      drive_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      trashed_at TEXT,
      PRIMARY KEY (user_email, folder_id)
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS work_note_drive_folders_key_idx
      ON work_note_drive_folders(user_email, managed_key)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_drive_folders_parent_idx
      ON work_note_drive_folders(user_email, parent_folder_id, folder_type)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_drive_operations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      before_path TEXT NOT NULL DEFAULT '',
      after_path TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_drive_operations_user_idx
      ON work_note_drive_operations(user_email, created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_drive_operations_status_idx
      ON work_note_drive_operations(user_email, status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_drive_locks (
      user_email TEXT NOT NULL,
      lock_key TEXT NOT NULL,
      owner_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_email, lock_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_drive_folder_aliases (
      user_email TEXT NOT NULL,
      alias_key TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      folder_type TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_email, alias_key)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_drive_folder_aliases_folder_idx
      ON work_note_drive_folder_aliases(user_email, folder_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_upload_sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      operation_token TEXT NOT NULL,
      source_key TEXT NOT NULL,
      r2_upload_id TEXT NOT NULL DEFAULT '',
      encrypted_drive_session_uri TEXT NOT NULL DEFAULT '',
      drive_session_created_at TEXT NOT NULL DEFAULT '',
      existing_drive_file_id TEXT NOT NULL DEFAULT '',
      drive_file_id TEXT NOT NULL DEFAULT '',
      destination_folder_id TEXT NOT NULL DEFAULT '',
      company_folder_id TEXT NOT NULL DEFAULT '',
      memo_folder_id TEXT NOT NULL DEFAULT '',
      drive_path TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      total_bytes INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL DEFAULT 8388608,
      source_uploaded_bytes INTEGER NOT NULL DEFAULT 0,
      confirmed_bytes INTEGER NOT NULL DEFAULT 0,
      current_chunk INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      source_status TEXT NOT NULL DEFAULT 'pending',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT NOT NULL DEFAULT '',
      user_message TEXT NOT NULL DEFAULT '',
      error_detail TEXT NOT NULL DEFAULT '',
      failure_stage TEXT NOT NULL DEFAULT '',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_retry_at TEXT NOT NULL DEFAULT '',
      auto_recoverable INTEGER NOT NULL DEFAULT 0,
      user_action_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS work_note_upload_sessions_token_idx
      ON work_note_upload_sessions(user_email, operation_token)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS work_note_upload_sessions_attachment_idx
      ON work_note_upload_sessions(user_email, attachment_id, updated_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS work_note_upload_parts (
      session_id TEXT NOT NULL,
      part_number INTEGER NOT NULL,
      byte_start INTEGER NOT NULL,
      byte_end INTEGER NOT NULL,
      part_size INTEGER NOT NULL,
      r2_etag TEXT NOT NULL,
      chunk_hash TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL,
      PRIMARY KEY (session_id, part_number)
    )`),
  ]);

  const columns: Array<[string, string]> = [
    ["storage_provider", "TEXT NOT NULL DEFAULT 'site_storage'"],
    ["drive_file_id", "TEXT"],
    ["drive_folder_id", "TEXT"],
    ["drive_company_folder_id", "TEXT NOT NULL DEFAULT ''"],
    ["drive_memo_folder_id", "TEXT NOT NULL DEFAULT ''"],
    ["drive_category_folder_id", "TEXT NOT NULL DEFAULT ''"],
    ["drive_path", "TEXT NOT NULL DEFAULT ''"],
    ["drive_web_view_link", "TEXT NOT NULL DEFAULT ''"],
    ["file_category", "TEXT NOT NULL DEFAULT '기타'"],
    ["display_file_name", "TEXT NOT NULL DEFAULT ''"],
    ["extension", "TEXT NOT NULL DEFAULT ''"],
    ["upload_status", "TEXT NOT NULL DEFAULT 'completed'"],
    ["preview_available", "INTEGER NOT NULL DEFAULT 0"],
    ["uploaded_by", "TEXT NOT NULL DEFAULT ''"],
    ["migration_json", "TEXT NOT NULL DEFAULT '{}'"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
    ["sync_status", "TEXT NOT NULL DEFAULT '동기화 완료'"],
    ["last_synced_at", "TEXT NOT NULL DEFAULT ''"],
    ["last_error", "TEXT NOT NULL DEFAULT ''"],
    ["sync_error_code", "TEXT NOT NULL DEFAULT ''"],
    ["sync_error_message", "TEXT NOT NULL DEFAULT ''"],
    ["sync_error_detail", "TEXT NOT NULL DEFAULT ''"],
    ["failure_stage", "TEXT NOT NULL DEFAULT ''"],
    ["failed_at", "TEXT NOT NULL DEFAULT ''"],
    ["retry_count", "INTEGER NOT NULL DEFAULT 0"],
    ["last_retry_at", "TEXT NOT NULL DEFAULT ''"],
    ["last_retry_result", "TEXT NOT NULL DEFAULT ''"],
    ["auto_recoverable", "INTEGER NOT NULL DEFAULT 0"],
    ["user_action_required", "INTEGER NOT NULL DEFAULT 0"],
    ["upload_session_id", "TEXT NOT NULL DEFAULT ''"],
    ["processed_bytes", "INTEGER NOT NULL DEFAULT 0"],
    ["total_bytes", "INTEGER NOT NULL DEFAULT 0"],
    ["current_chunk", "INTEGER NOT NULL DEFAULT 0"],
    ["source_status", "TEXT NOT NULL DEFAULT ''"],
    ["source_storage_key", "TEXT NOT NULL DEFAULT ''"],
    ["operation_token", "TEXT NOT NULL DEFAULT ''"],
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
