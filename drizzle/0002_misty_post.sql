CREATE TABLE `work_note_drive_folders` (
	`user_email` text NOT NULL,
	`folder_id` text NOT NULL,
	`managed_key` text NOT NULL,
	`parent_folder_id` text NOT NULL,
	`folder_type` text NOT NULL,
	`folder_name` text NOT NULL,
	`company_id` text DEFAULT '' NOT NULL,
	`memo_id` text DEFAULT '' NOT NULL,
	`file_category` text DEFAULT '' NOT NULL,
	`drive_path` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`last_synced_at` text NOT NULL,
	`trashed_at` text,
	PRIMARY KEY(`user_email`, `folder_id`)
);
--> statement-breakpoint
CREATE INDEX `work_note_drive_folders_parent_idx` ON `work_note_drive_folders` (`user_email`,`parent_folder_id`,`folder_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_note_drive_folders_key_idx` ON `work_note_drive_folders` (`user_email`,`managed_key`);--> statement-breakpoint
CREATE TABLE `work_note_drive_locks` (
	`user_email` text NOT NULL,
	`lock_key` text NOT NULL,
	`owner_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_email`, `lock_key`)
);
--> statement-breakpoint
CREATE TABLE `work_note_drive_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`operation_type` text NOT NULL,
	`status` text NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`before_path` text DEFAULT '' NOT NULL,
	`after_path` text DEFAULT '' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_note_drive_operations_user_idx` ON `work_note_drive_operations` (`user_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `work_note_drive_operations_status_idx` ON `work_note_drive_operations` (`user_email`,`status`);--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_company_folder_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_memo_folder_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_category_folder_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_path` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_web_view_link` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `file_category` text DEFAULT '기타' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `sync_status` text DEFAULT '동기화 완료' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `last_synced_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `last_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `operation_token` text DEFAULT '' NOT NULL;