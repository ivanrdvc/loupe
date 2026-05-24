CREATE TABLE `prompt_tag_link` (
	`prompt_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `prompt_tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_tag_link_pk` ON `prompt_tag_link` (`prompt_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `prompt_tag_link_tag_idx` ON `prompt_tag_link` (`tag_id`);--> statement-breakpoint
CREATE TABLE `prompt_tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'slate' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_tag_name_idx` ON `prompt_tag` (`name`);--> statement-breakpoint
ALTER TABLE `prompt_version` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `prompt` ADD `run_config_json` text;