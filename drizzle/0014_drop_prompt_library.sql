DROP TABLE `prompt_folder`;--> statement-breakpoint
DROP TABLE `prompt_tag_link`;--> statement-breakpoint
DROP TABLE `prompt_tag`;--> statement-breakpoint
DROP TABLE `prompt_version`;--> statement-breakpoint
DROP TABLE `prompt`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_score` (
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
	`evaluator_version` integer,
	`error_type` text,
	`run_id` integer,
	`definition_id` integer,
	`dataset_run_item_id` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `eval_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `eval_definition`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dataset_run_item_id`) REFERENCES `dataset_run_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_score`("id", "target_kind", "target_id", "parent_trace_id", "parent_session_id", "session_source", "response_id", "name", "data_type", "value", "label", "explanation", "source", "evaluator", "evaluator_version", "error_type", "run_id", "definition_id", "dataset_run_item_id", "metadata", "created_at") SELECT "id", "target_kind", "target_id", "parent_trace_id", "parent_session_id", "session_source", "response_id", "name", "data_type", "value", "label", "explanation", "source", "evaluator", "evaluator_version", "error_type", "run_id", "definition_id", "dataset_run_item_id", "metadata", "created_at" FROM `score`;--> statement-breakpoint
DROP TABLE `score`;--> statement-breakpoint
ALTER TABLE `__new_score` RENAME TO `score`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `score_live_unique` ON `score` (`target_kind`,`target_id`,`name`,`evaluator`) WHERE run_id IS NULL;--> statement-breakpoint
CREATE INDEX `score_target_idx` ON `score` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `score_name_created_idx` ON `score` (`name`,`created_at`);--> statement-breakpoint
CREATE INDEX `score_parent_trace_idx` ON `score` (`parent_trace_id`);--> statement-breakpoint
CREATE INDEX `score_run_idx` ON `score` (`run_id`);--> statement-breakpoint
CREATE INDEX `score_definition_idx` ON `score` (`definition_id`);