CREATE UNIQUE INDEX `fragments_active_key_unique` ON `fragments` (`key`) WHERE `is_discarded` = 0;
--> statement-breakpoint
CREATE UNIQUE INDEX `fragments_discarded_key_unique` ON `fragments` (`key`) WHERE `is_discarded` = 1;
