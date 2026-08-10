CREATE TABLE `work_note_drive_folder_aliases` (
	`user_email` text NOT NULL,
	`alias_key` text NOT NULL,
	`folder_id` text NOT NULL,
	`folder_type` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_email`, `alias_key`)
);
--> statement-breakpoint
CREATE INDEX `work_note_drive_folder_aliases_folder_idx` ON `work_note_drive_folder_aliases` (`user_email`,`folder_id`);--> statement-breakpoint
CREATE TABLE `work_note_upload_parts` (
	`session_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`byte_start` integer NOT NULL,
	`byte_end` integer NOT NULL,
	`part_size` integer NOT NULL,
	`r2_etag` text NOT NULL,
	`chunk_hash` text DEFAULT '' NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `part_number`)
);
--> statement-breakpoint
CREATE TABLE `work_note_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`attachment_id` text NOT NULL,
	`operation_token` text NOT NULL,
	`source_key` text NOT NULL,
	`r2_upload_id` text DEFAULT '' NOT NULL,
	`encrypted_drive_session_uri` text DEFAULT '' NOT NULL,
	`drive_session_created_at` text DEFAULT '' NOT NULL,
	`existing_drive_file_id` text DEFAULT '' NOT NULL,
	`drive_file_id` text DEFAULT '' NOT NULL,
	`destination_folder_id` text DEFAULT '' NOT NULL,
	`company_folder_id` text DEFAULT '' NOT NULL,
	`memo_folder_id` text DEFAULT '' NOT NULL,
	`drive_path` text DEFAULT '' NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`total_bytes` integer NOT NULL,
	`chunk_size` integer DEFAULT 8388608 NOT NULL,
	`source_uploaded_bytes` integer DEFAULT 0 NOT NULL,
	`confirmed_bytes` integer DEFAULT 0 NOT NULL,
	`current_chunk` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_status` text DEFAULT 'pending' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`user_message` text DEFAULT '' NOT NULL,
	`error_detail` text DEFAULT '' NOT NULL,
	`failure_stage` text DEFAULT '' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_retry_at` text DEFAULT '' NOT NULL,
	`auto_recoverable` integer DEFAULT 0 NOT NULL,
	`user_action_required` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_note_upload_sessions_token_idx` ON `work_note_upload_sessions` (`user_email`,`operation_token`);--> statement-breakpoint
CREATE INDEX `work_note_upload_sessions_attachment_idx` ON `work_note_upload_sessions` (`user_email`,`attachment_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `sync_error_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `sync_error_message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `sync_error_detail` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `failure_stage` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `failed_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `last_retry_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `last_retry_result` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `auto_recoverable` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `user_action_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `upload_session_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `processed_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `total_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `current_chunk` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `source_status` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `source_storage_key` text DEFAULT '' NOT NULL;
