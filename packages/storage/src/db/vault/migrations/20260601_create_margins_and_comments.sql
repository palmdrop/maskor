CREATE TABLE `margins` (
	`fragment_uuid` text PRIMARY KEY NOT NULL,
	`fragment_key` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`file_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `margins_file_path_unique` ON `margins` (`file_path`);--> statement-breakpoint
CREATE TABLE `comments` (
	`fragment_uuid` text NOT NULL,
	`marker_id` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`orphaned` integer DEFAULT false NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `marker_id`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `margins`(`fragment_uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_fragment_uuid_idx` ON `comments` (`fragment_uuid`);--> statement-breakpoint
CREATE INDEX `comments_orphaned_idx` ON `comments` (`orphaned`);
