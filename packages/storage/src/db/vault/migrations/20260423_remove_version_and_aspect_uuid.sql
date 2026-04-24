ALTER TABLE `fragments` DROP COLUMN `version`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_fragment_properties` (
	`fragment_uuid` text NOT NULL,
	`aspect_key` text NOT NULL,
	`weight` real NOT NULL,
	PRIMARY KEY(`fragment_uuid`, `aspect_key`),
	FOREIGN KEY (`fragment_uuid`) REFERENCES `fragments`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_fragment_properties`(`fragment_uuid`, `aspect_key`, `weight`) SELECT `fragment_uuid`, `aspect_key`, `weight` FROM `fragment_properties`;
--> statement-breakpoint
DROP TABLE `fragment_properties`;
--> statement-breakpoint
ALTER TABLE `__new_fragment_properties` RENAME TO `fragment_properties`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
