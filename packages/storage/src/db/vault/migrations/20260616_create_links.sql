CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_uuid` text NOT NULL,
	`target_type` text,
	`target_key` text NOT NULL,
	`target_uuid` text,
	`alias` text,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`snippet` text,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `links_target_idx` ON `links` (`target_type`,`target_key`);--> statement-breakpoint
CREATE INDEX `links_source_idx` ON `links` (`source_type`,`source_uuid`);
