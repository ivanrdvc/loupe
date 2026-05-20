DROP TABLE IF EXISTS `annotation`;--> statement-breakpoint
CREATE TABLE `note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`body` text NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_target_unique` ON `note` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `note_updated_idx` ON `note` (`updated_at`);