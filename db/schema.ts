import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workNoteDatasets = sqliteTable("work_note_datasets", {
  userEmail: text("user_email").primaryKey(),
  payload: text("payload").notNull(),
  dataVersion: text("data_version").notNull().default("sites-work-note-v1"),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const workNoteAttachments = sqliteTable(
  "work_note_attachments",
  {
    userEmail: text("user_email").notNull(),
    localId: text("local_id").notNull(),
    ownerKind: text("owner_kind").notNull().default("unknown"),
    ownerLocalId: text("owner_local_id").notNull().default(""),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: text("file_size").notNull().default("0"),
    sha256: text("sha256"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.localId] }),
    index("work_note_attachments_owner_idx").on(
      table.userEmail,
      table.ownerKind,
      table.ownerLocalId,
    ),
  ],
);

export const workNoteMigrationLogs = sqliteTable(
  "work_note_migration_logs",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    payload: text("payload").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("work_note_migration_logs_user_idx").on(table.userEmail),
  ],
);
