ALTER TABLE `note` ADD `status` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `note` ADD `resolved_at` integer;--> statement-breakpoint
CREATE INDEX `note_status_updated_idx` ON `note` (`status`,`updated_at`);