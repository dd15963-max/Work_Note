import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workNoteDatasets = sqliteTable("work_note_datasets", {
  userEmail: text("user_email").primaryKey(),
  payload: text("payload").notNull(),
  dataVersion: text("data_version").notNull().default("sites-work-note-v1"),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const workNoteAttachments = sqliteTable("work_note_attachments", {
  userEmail: text("user_email").notNull(),
  localId: text("local_id").notNull(),
  ownerKind: text("owner_kind").notNull().default("unknown"),
  ownerLocalId: text("owner_local_id").notNull().default(""),
  storageKey: text("storage_key").notNull(),
  storageProvider: text("storage_provider").notNull().default("site_storage"),
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  driveCompanyFolderId: text("drive_company_folder_id").notNull().default(""),
  driveMemoFolderId: text("drive_memo_folder_id").notNull().default(""),
  driveCategoryFolderId: text("drive_category_folder_id").notNull().default(""),
  drivePath: text("drive_path").notNull().default(""),
  driveWebViewLink: text("drive_web_view_link").notNull().default(""),
  fileCategory: text("file_category").notNull().default("기타"),
  fileName: text("file_name").notNull(),
  displayFileName: text("display_file_name").notNull().default(""),
  mimeType: text("mime_type").notNull(),
  extension: text("extension").notNull().default(""),
  fileSize: text("file_size").notNull().default("0"),
  sha256: text("sha256"),
  uploadStatus: text("upload_status").notNull().default("completed"),
  previewAvailable: integer("preview_available").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  migrationJson: text("migration_json").notNull().default("{}"),
  syncStatus: text("sync_status").notNull().default("동기화 완료"),
  lastSyncedAt: text("last_synced_at").notNull().default(""),
  lastError: text("last_error").notNull().default(""),
  syncErrorCode: text("sync_error_code").notNull().default(""),
  syncErrorMessage: text("sync_error_message").notNull().default(""),
  syncErrorDetail: text("sync_error_detail").notNull().default(""),
  failureStage: text("failure_stage").notNull().default(""),
  failedAt: text("failed_at").notNull().default(""),
  retryCount: integer("retry_count").notNull().default(0),
  lastRetryAt: text("last_retry_at").notNull().default(""),
  lastRetryResult: text("last_retry_result").notNull().default(""),
  autoRecoverable: integer("auto_recoverable").notNull().default(0),
  userActionRequired: integer("user_action_required").notNull().default(0),
  uploadSessionId: text("upload_session_id").notNull().default(""),
  processedBytes: integer("processed_bytes").notNull().default(0),
  totalBytes: integer("total_bytes").notNull().default(0),
  currentChunk: integer("current_chunk").notNull().default(0),
  sourceStatus: text("source_status").notNull().default(""),
  sourceStorageKey: text("source_storage_key").notNull().default(""),
  operationToken: text("operation_token").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
}, (table) => [
  primaryKey({ columns: [table.userEmail, table.localId] }),
  index("work_note_attachments_owner_idx").on(table.userEmail, table.ownerKind, table.ownerLocalId),
]);

export const workNoteGoogleDriveConnections = sqliteTable("work_note_google_drive_connections", {
  userEmail: text("user_email").primaryKey(),
  googleEmail: text("google_email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull().default(""),
  accessTokenExpiresAt: text("access_token_expires_at").notNull().default(""),
  scope: text("scope").notNull().default(""),
  rootFolderId: text("root_folder_id").notNull().default(""),
  rootFolderName: text("root_folder_name").notNull().default("Work Note"),
  connectedAt: text("connected_at").notNull(),
  lastSyncedAt: text("last_synced_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
  disconnectedAt: text("disconnected_at"),
});

export const workNoteGoogleOauthStates = sqliteTable("work_note_google_oauth_states", {
  state: text("state").primaryKey(),
  userEmail: text("user_email").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  returnTo: text("return_to").notNull().default("/"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("work_note_google_oauth_states_user_idx").on(table.userEmail)]);

export const workNoteFileRecovery = sqliteTable("work_note_file_recovery", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  localId: text("local_id").notNull().default(""),
  driveFileId: text("drive_file_id").notNull().default(""),
  issueType: text("issue_type").notNull(),
  payload: text("payload").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
}, (table) => [index("work_note_file_recovery_user_idx").on(table.userEmail)]);

export const workNoteMigrationLogs = sqliteTable("work_note_migration_logs", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  payload: text("payload").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("work_note_migration_logs_user_idx").on(table.userEmail)]);

export const workNoteDriveFolders = sqliteTable("work_note_drive_folders", {
  userEmail: text("user_email").notNull(),
  folderId: text("folder_id").notNull(),
  managedKey: text("managed_key").notNull(),
  parentFolderId: text("parent_folder_id").notNull(),
  folderType: text("folder_type").notNull(),
  folderName: text("folder_name").notNull(),
  companyId: text("company_id").notNull().default(""),
  memoId: text("memo_id").notNull().default(""),
  fileCategory: text("file_category").notNull().default(""),
  drivePath: text("drive_path").notNull().default(""),
  createdAt: text("created_at").notNull(),
  lastSyncedAt: text("last_synced_at").notNull(),
  trashedAt: text("trashed_at"),
}, (table) => [
  primaryKey({ columns: [table.userEmail, table.folderId] }),
  index("work_note_drive_folders_parent_idx").on(table.userEmail, table.parentFolderId, table.folderType),
  uniqueIndex("work_note_drive_folders_key_idx").on(table.userEmail, table.managedKey),
]);

export const workNoteDriveOperations = sqliteTable("work_note_drive_operations", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  operationType: text("operation_type").notNull(),
  status: text("status").notNull(),
  targetId: text("target_id").notNull().default(""),
  beforePath: text("before_path").notNull().default(""),
  afterPath: text("after_path").notNull().default(""),
  payload: text("payload").notNull().default("{}"),
  errorMessage: text("error_message").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("work_note_drive_operations_user_idx").on(table.userEmail, table.createdAt),
  index("work_note_drive_operations_status_idx").on(table.userEmail, table.status),
]);

export const workNoteDriveLocks = sqliteTable("work_note_drive_locks", {
  userEmail: text("user_email").notNull(),
  lockKey: text("lock_key").notNull(),
  ownerToken: text("owner_token").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userEmail, table.lockKey] }),
]);

export const workNoteDriveFolderAliases = sqliteTable("work_note_drive_folder_aliases", {
  userEmail: text("user_email").notNull(),
  aliasKey: text("alias_key").notNull(),
  folderId: text("folder_id").notNull(),
  folderType: text("folder_type").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userEmail, table.aliasKey] }),
  index("work_note_drive_folder_aliases_folder_idx").on(table.userEmail, table.folderId),
]);

export const workNoteUploadSessions = sqliteTable("work_note_upload_sessions", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  attachmentId: text("attachment_id").notNull(),
  operationToken: text("operation_token").notNull(),
  sourceKey: text("source_key").notNull(),
  r2UploadId: text("r2_upload_id").notNull().default(""),
  encryptedDriveSessionUri: text("encrypted_drive_session_uri").notNull().default(""),
  driveSessionCreatedAt: text("drive_session_created_at").notNull().default(""),
  existingDriveFileId: text("existing_drive_file_id").notNull().default(""),
  driveFileId: text("drive_file_id").notNull().default(""),
  destinationFolderId: text("destination_folder_id").notNull().default(""),
  companyFolderId: text("company_folder_id").notNull().default(""),
  memoFolderId: text("memo_folder_id").notNull().default(""),
  drivePath: text("drive_path").notNull().default(""),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  totalBytes: integer("total_bytes").notNull(),
  chunkSize: integer("chunk_size").notNull().default(8 * 1024 * 1024),
  sourceUploadedBytes: integer("source_uploaded_bytes").notNull().default(0),
  confirmedBytes: integer("confirmed_bytes").notNull().default(0),
  currentChunk: integer("current_chunk").notNull().default(0),
  status: text("status").notNull().default("pending"),
  sourceStatus: text("source_status").notNull().default("pending"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  errorCode: text("error_code").notNull().default(""),
  userMessage: text("user_message").notNull().default(""),
  errorDetail: text("error_detail").notNull().default(""),
  failureStage: text("failure_stage").notNull().default(""),
  retryCount: integer("retry_count").notNull().default(0),
  lastRetryAt: text("last_retry_at").notNull().default(""),
  autoRecoverable: integer("auto_recoverable").notNull().default(0),
  userActionRequired: integer("user_action_required").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at").notNull().default(""),
}, (table) => [
  uniqueIndex("work_note_upload_sessions_token_idx").on(table.userEmail, table.operationToken),
  index("work_note_upload_sessions_attachment_idx").on(table.userEmail, table.attachmentId, table.updatedAt),
]);

export const workNoteUploadParts = sqliteTable("work_note_upload_parts", {
  sessionId: text("session_id").notNull(),
  partNumber: integer("part_number").notNull(),
  byteStart: integer("byte_start").notNull(),
  byteEnd: integer("byte_end").notNull(),
  partSize: integer("part_size").notNull(),
  r2Etag: text("r2_etag").notNull(),
  chunkHash: text("chunk_hash").notNull().default(""),
  completedAt: text("completed_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.partNumber] }),
]);
