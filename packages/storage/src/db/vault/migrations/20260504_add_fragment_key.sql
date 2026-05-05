ALTER TABLE `fragments` ADD COLUMN `key` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `fragments` SET `key` = REPLACE(CASE WHEN `file_path` LIKE 'discarded/%' THEN SUBSTR(`file_path`, LENGTH('discarded/') + 1) ELSE `file_path` END, '.md', '');
