CREATE TABLE `fragment_stats` (
	`fragment_uuid` text PRIMARY KEY NOT NULL,
	`voluntary_open_count` integer NOT NULL DEFAULT 0,
	`prompt_accept_count` integer NOT NULL DEFAULT 0,
	`avoidance_count` integer NOT NULL DEFAULT 0,
	`edit_count` integer NOT NULL DEFAULT 0,
	`last_surfaced_at` integer,
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fragment_stats_last_surfaced_at_idx` ON `fragment_stats` (`last_surfaced_at`);
