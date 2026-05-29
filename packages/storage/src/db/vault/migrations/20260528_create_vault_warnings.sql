CREATE TABLE `vault_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`dedup_key` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`dismissed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vault_warnings_kind_dedup_unique` ON `vault_warnings` (`kind`,`dedup_key`);
