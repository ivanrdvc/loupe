CREATE TABLE `eval_definition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`scope` text DEFAULT 'trace' NOT NULL,
	`data_type` text NOT NULL,
	`source` text DEFAULT 'llm' NOT NULL,
	`judge_prompt` text,
	`model` text DEFAULT 'gpt-4o-mini' NOT NULL,
	`target_field_hints` text,
	`mode` text DEFAULT 'offline' NOT NULL,
	`live_filter` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`baseline_run_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baseline_run_id`) REFERENCES `eval_run`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `eval_definition_mode_idx` ON `eval_definition` (`mode`);--> statement-breakpoint
CREATE INDEX `eval_definition_name_idx` ON `eval_definition` (`name`);--> statement-breakpoint
CREATE TABLE `eval_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_id` integer NOT NULL,
	`definition_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_selector` text,
	`blessed` integer DEFAULT false NOT NULL,
	`git_sha` text,
	`env` text,
	`started_at` integer,
	`ended_at` integer,
	`summary` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `eval_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `eval_run_definition_idx` ON `eval_run` (`definition_id`);--> statement-breakpoint
CREATE INDEX `eval_run_status_idx` ON `eval_run` (`status`);--> statement-breakpoint
CREATE TABLE `score_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`data_type` text NOT NULL,
	`min_value` real,
	`max_value` real,
	`categories` text,
	`pass_labels` text,
	`fail_labels` text,
	`direction` text DEFAULT 'higher_better' NOT NULL,
	`description` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_config_name_idx` ON `score_config` (`name`);--> statement-breakpoint
CREATE TABLE `score` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`parent_trace_id` text,
	`parent_session_id` text,
	`session_source` text,
	`response_id` text,
	`name` text NOT NULL,
	`data_type` text NOT NULL,
	`value` real,
	`label` text,
	`explanation` text,
	`source` text NOT NULL,
	`evaluator` text NOT NULL,
	`error_type` text,
	`run_id` integer,
	`definition_id` integer,
	`prompt_version_id` integer,
	`dataset_run_item_id` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `eval_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `eval_definition`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_version`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dataset_run_item_id`) REFERENCES `dataset_run_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_live_unique` ON `score` (`target_kind`,`target_id`,`name`,`evaluator`) WHERE run_id IS NULL;--> statement-breakpoint
CREATE INDEX `score_target_idx` ON `score` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `score_name_created_idx` ON `score` (`name`,`created_at`);--> statement-breakpoint
CREATE INDEX `score_parent_trace_idx` ON `score` (`parent_trace_id`);--> statement-breakpoint
CREATE INDEX `score_run_idx` ON `score` (`run_id`);--> statement-breakpoint
CREATE INDEX `score_definition_idx` ON `score` (`definition_id`);