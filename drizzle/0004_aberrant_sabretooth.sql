CREATE TABLE `work_note_team_share_settings` (
	`user_email` text PRIMARY KEY NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`sheet_name` text DEFAULT '영업 리드 건 관리' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_note_team_share_syncs` (
	`user_email` text NOT NULL,
	`task_type` text NOT NULL,
	`task_local_id` text NOT NULL,
	`shared_id` text NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`sheet_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lock_token` text DEFAULT '' NOT NULL,
	`lock_expires_at` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`last_synced_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_email`, `task_type`, `task_local_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_note_team_share_syncs_shared_id_unique` ON `work_note_team_share_syncs` (`shared_id`);--> statement-breakpoint
CREATE INDEX `work_note_team_share_syncs_status_idx` ON `work_note_team_share_syncs` (`status`);