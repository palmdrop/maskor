PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`uuid` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_notes`("uuid", "key", "content_hash", "file_path", "deleted_at", "synced_at") SELECT "uuid", "title", "content_hash", "file_path", "deleted_at", "synced_at" FROM `notes`;
--> statement-breakpoint
DROP TABLE `notes`;
--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_key_unique` ON `notes` (`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_file_path_unique` ON `notes` (`file_path`);
--> statement-breakpoint
CREATE INDEX `notes_deleted_at_idx` ON `notes` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `__new_fragment_notes` (
	`fragment_uuid` text NOT NULL,
	`note_key` text NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `note_key`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_fragment_notes`("fragment_uuid", "note_key") SELECT "fragment_uuid", "note_title" FROM `fragment_notes`;
--> statement-breakpoint
DROP TABLE `fragment_notes`;
--> statement-breakpoint
ALTER TABLE `__new_fragment_notes` RENAME TO `fragment_notes`;
--> statement-breakpoint
CREATE TABLE `__new_aspect_notes` (
	`aspect_uuid` text NOT NULL,
	`note_key` text NOT NULL,
	PRIMARY KEY(`aspect_uuid`, `note_key`),
	FOREIGN KEY (`aspect_uuid`) REFERENCES `aspects`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_aspect_notes`("aspect_uuid", "note_key") SELECT "aspect_uuid", "note_title" FROM `aspect_notes`;
--> statement-breakpoint
DROP TABLE `aspect_notes`;
--> statement-breakpoint
ALTER TABLE `__new_aspect_notes` RENAME TO `aspect_notes`;
--> statement-breakpoint
CREATE TABLE `__new_project_references` (
	`uuid` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_project_references`("uuid", "key", "content_hash", "file_path", "deleted_at", "synced_at") SELECT "uuid", "name", "content_hash", "file_path", "deleted_at", "synced_at" FROM `project_references`;
--> statement-breakpoint
DROP TABLE `project_references`;
--> statement-breakpoint
ALTER TABLE `__new_project_references` RENAME TO `project_references`;
--> statement-breakpoint
CREATE UNIQUE INDEX `project_references_key_unique` ON `project_references` (`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_references_file_path_unique` ON `project_references` (`file_path`);
--> statement-breakpoint
CREATE INDEX `references_deleted_at_idx` ON `project_references` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `__new_fragment_references` (
	`fragment_uuid` text NOT NULL,
	`reference_key` text NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `reference_key`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_fragment_references`("fragment_uuid", "reference_key") SELECT "fragment_uuid", "reference_name" FROM `fragment_references`;
--> statement-breakpoint
DROP TABLE `fragment_references`;
--> statement-breakpoint
ALTER TABLE `__new_fragment_references` RENAME TO `fragment_references`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
