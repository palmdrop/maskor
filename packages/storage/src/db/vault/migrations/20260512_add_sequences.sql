CREATE TABLE `sequences` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_uuid` text NOT NULL,
	`is_main` integer NOT NULL DEFAULT false,
	`file_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`synced_at` integer NOT NULL,
	CONSTRAINT `file_path_unique` UNIQUE(`file_path`)
);
--> statement-breakpoint
CREATE INDEX `sequences_project_uuid_idx` ON `sequences` (`project_uuid`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sequences_main_per_project_unique` ON `sequences` (`project_uuid`) WHERE `is_main` = 1;
--> statement-breakpoint
CREATE TABLE `sections` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sequence_uuid` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`sequence_uuid`) REFERENCES `sequences`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_sequence_position_unique` ON `sections` (`sequence_uuid`, `position`);
--> statement-breakpoint
CREATE TABLE `fragment_positions` (
	`uuid` text PRIMARY KEY NOT NULL,
	`fragment_uuid` text NOT NULL,
	`section_uuid` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_uuid`) REFERENCES `sections`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fragment_positions_section_position_unique` ON `fragment_positions` (`section_uuid`, `position`);
--> statement-breakpoint
CREATE INDEX `fragment_positions_fragment_uuid_idx` ON `fragment_positions` (`fragment_uuid`);
