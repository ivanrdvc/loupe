CREATE TABLE `inventory_version` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_id` integer NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`observed_at` integer NOT NULL,
	`trace_id` text,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_version_entity_idx` ON `inventory_version` (`inventory_id`,`field`,`observed_at`);