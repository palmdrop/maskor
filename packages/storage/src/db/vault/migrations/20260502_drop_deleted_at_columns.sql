DROP INDEX `fragments_deleted_at_idx`;
--> statement-breakpoint
DROP INDEX `fragments_is_discarded_deleted_at_idx`;
--> statement-breakpoint
DROP INDEX `aspects_deleted_at_idx`;
--> statement-breakpoint
DROP INDEX `notes_deleted_at_idx`;
--> statement-breakpoint
DROP INDEX `references_deleted_at_idx`;
--> statement-breakpoint
ALTER TABLE `fragments` DROP COLUMN `deleted_at`;
--> statement-breakpoint
ALTER TABLE `aspects` DROP COLUMN `deleted_at`;
--> statement-breakpoint
ALTER TABLE `notes` DROP COLUMN `deleted_at`;
--> statement-breakpoint
ALTER TABLE `project_references` DROP COLUMN `deleted_at`;
--> statement-breakpoint
CREATE INDEX `fragments_is_discarded_idx` ON `fragments` (`is_discarded`);
