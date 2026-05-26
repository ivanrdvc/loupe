CREATE TABLE `metric_rollup` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric` text NOT NULL,
	`bucket_key` text NOT NULL,
	`value` real NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`computed_at` integer NOT NULL,
	`sample_ref` text
);
--> statement-breakpoint
CREATE INDEX `metric_rollup_metric_period_idx` ON `metric_rollup` (`metric`,`period_end`);--> statement-breakpoint
CREATE INDEX `metric_rollup_metric_bucket_idx` ON `metric_rollup` (`metric`,`bucket_key`);