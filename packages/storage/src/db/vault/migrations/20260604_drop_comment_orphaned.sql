DROP INDEX `comments_orphaned_idx`;
--> statement-breakpoint
ALTER TABLE `comments` DROP COLUMN `orphaned`;
