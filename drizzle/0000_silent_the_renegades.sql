CREATE TABLE `work_note_attachments` (
	`user_email` text NOT NULL,
	`local_id` text NOT NULL,
	`owner_kind` text DEFAULT 'unknown' NOT NULL,
	`owner_local_id` text DEFAULT '' NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` text DEFAULT '0' NOT NULL,
	`sha256` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_email`, `local_id`)
);
--> statement-breakpoint
CREATE INDEX `work_note_attachments_owner_idx` ON `work_note_attachments` (`user_email`,`owner_kind`,`owner_local_id`);--> statement-breakpoint
CREATE TABLE `work_note_datasets` (
	`user_email` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`data_version` text DEFAULT 'sites-work-note-v1' NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `work_note_migration_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_note_migration_logs_user_idx` ON `work_note_migration_logs` (`user_email`);