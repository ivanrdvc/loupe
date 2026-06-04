DROP TABLE `alert_rule`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inbox_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`fired_at` integer NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`trace_id` text,
	`dedupe_key` text NOT NULL,
	`dismissed_at` integer,
	`snooze_until` integer
);
--> statement-breakpoint
INSERT INTO `__new_inbox_item`("id", "kind", "fired_at", "summary", "payload_json", "trace_id", "dedupe_key", "dismissed_at", "snooze_until") SELECT "id", "kind", "fired_at", "summary", "payload_json", "trace_id", "dedupe_key", "dismissed_at", "snooze_until" FROM `inbox_item`;--> statement-breakpoint
DROP TABLE `inbox_item`;--> statement-breakpoint
ALTER TABLE `__new_inbox_item` RENAME TO `inbox_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_item_dedupe_key_idx` ON `inbox_item` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `inbox_item_open_idx` ON `inbox_item` (`dismissed_at`,`fired_at`);