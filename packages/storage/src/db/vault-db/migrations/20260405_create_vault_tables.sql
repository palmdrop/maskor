CREATE TABLE `aspect_notes` (
	`aspect_uuid` text NOT NULL,
	`note_title` text NOT NULL,
	PRIMARY KEY(`aspect_uuid`, `note_title`),
	FOREIGN KEY (`aspect_uuid`) REFERENCES `aspects`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `aspects` (
	`uuid` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`category` text,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aspects_key_unique` ON `aspects` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `aspects_file_path_unique` ON `aspects` (`file_path`);--> statement-breakpoint
CREATE TABLE `fragment_notes` (
	`fragment_uuid` text NOT NULL,
	`note_title` text NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `note_title`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fragment_properties` (
	`fragment_uuid` text NOT NULL,
	`aspect_key` text NOT NULL,
	`aspect_uuid` text,
	`weight` real NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `aspect_key`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`aspect_uuid`) REFERENCES `aspects`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `fragment_references` (
	`fragment_uuid` text NOT NULL,
	`reference_name` text NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `reference_name`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fragments` (
	`uuid` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`pool` text NOT NULL,
	`ready_status` real DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fragments_file_path_unique` ON `fragments` (`file_path`);--> statement-breakpoint
CREATE TABLE `notes` (
	`uuid` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_title_unique` ON `notes` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_file_path_unique` ON `notes` (`file_path`);--> statement-breakpoint
CREATE TABLE `project_references` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_references_name_unique` ON `project_references` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_references_file_path_unique` ON `project_references` (`file_path`);