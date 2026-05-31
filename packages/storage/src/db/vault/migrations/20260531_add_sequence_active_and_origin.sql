ALTER TABLE `sequences` ADD COLUMN `active` integer NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `sequences` ADD COLUMN `origin` text;
