CREATE TABLE `dataset_example` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` integer NOT NULL,
	`input_json` text DEFAULT '""' NOT NULL,
	`expected` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`source_trace_id` text,
	`source_span_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `dataset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dataset_example_dataset_idx` ON `dataset_example` (`dataset_id`);--> statement-breakpoint
CREATE TABLE `dataset_run_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`example_id` integer NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`conversation_id` text,
	`trace_id` text,
	`error_text` text,
	`raw_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `dataset_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`example_id`) REFERENCES `dataset_example`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dataset_run_item_run_idx` ON `dataset_run_item` (`run_id`);--> statement-breakpoint
CREATE INDEX `dataset_run_item_example_idx` ON `dataset_run_item` (`example_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataset_run_item_run_example_idx` ON `dataset_run_item` (`run_id`,`example_id`);--> statement-breakpoint
CREATE TABLE `dataset_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` integer NOT NULL,
	`dataset_version` integer NOT NULL,
	`label` text NOT NULL,
	`endpoint_url` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `dataset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dataset_run_dataset_idx` ON `dataset_run` (`dataset_id`);--> statement-breakpoint
CREATE TABLE `dataset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`endpoint_override` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
