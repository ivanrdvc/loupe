CREATE TABLE `prompt_folder` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`kind` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `prompt_folder`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_folder_parent_idx` ON `prompt_folder` (`parent_id`);--> statement-breakpoint
CREATE TABLE `prompt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` integer,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `prompt_folder`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prompt_folder_idx` ON `prompt` (`folder_id`);--> statement-breakpoint
CREATE TABLE `prompt_version` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prompt_id` integer NOT NULL,
	`version` integer NOT NULL,
	`messages_json` text DEFAULT '[]' NOT NULL,
	`model_params_json` text DEFAULT '{}' NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`response_format_json` text DEFAULT '{"type":"text"}' NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_version_prompt_version_idx` ON `prompt_version` (`prompt_id`,`version`);--> statement-breakpoint
CREATE INDEX `prompt_version_prompt_idx` ON `prompt_version` (`prompt_id`);
