import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
