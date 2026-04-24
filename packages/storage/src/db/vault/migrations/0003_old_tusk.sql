PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_fragments` (
	`uuid` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`is_discarded` integer DEFAULT false NOT NULL,
	`ready_status` real DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_fragments`("uuid", "title", "is_discarded", "ready_status", "content_hash", "file_path", "updated_at", "deleted_at", "synced_at") SELECT "uuid", "title", "is_discarded", "ready_status", "content_hash", "file_path", "updated_at", "deleted_at", "synced_at" FROM `fragments`;--> statement-breakpoint
DROP TABLE `fragments`;--> statement-breakpoint
ALTER TABLE `__new_fragments` RENAME TO `fragments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `fragments_file_path_unique` ON `fragments` (`file_path`);--> statement-breakpoint
CREATE INDEX `fragments_deleted_at_idx` ON `fragments` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `fragments_is_discarded_deleted_at_idx` ON `fragments` (`is_discarded`,`deleted_at`);--> statement-breakpoint
ALTER TABLE `aspects` ADD `content_hash` text NOT NULL DEFAULT '';