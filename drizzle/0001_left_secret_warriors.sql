CREATE TABLE `work_note_file_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`local_id` text DEFAULT '' NOT NULL,
	`drive_file_id` text DEFAULT '' NOT NULL,
	`issue_type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `work_note_file_recovery_user_idx` ON `work_note_file_recovery` (`user_email`);--> statement-breakpoint
CREATE TABLE `work_note_google_drive_connections` (
	`user_email` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`encrypted_access_token` text DEFAULT '' NOT NULL,
	`access_token_expires_at` text DEFAULT '' NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`root_folder_id` text DEFAULT '' NOT NULL,
	`root_folder_name` text DEFAULT 'Work Note' NOT NULL,
	`connected_at` text NOT NULL,
	`last_synced_at` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`disconnected_at` text
);
--> statement-breakpoint
CREATE TABLE `work_note_google_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_note_google_oauth_states_user_idx` ON `work_note_google_oauth_states` (`user_email`);--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `storage_provider` text DEFAULT 'site_storage' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_file_id` text;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `display_file_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `extension` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `upload_status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `preview_available` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `uploaded_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `migration_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_note_attachments` ADD `created_at` text DEFAULT '' NOT NULL;