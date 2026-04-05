CREATE TABLE `projects` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text DEFAULT 'local' NOT NULL,
	`name` text NOT NULL,
	`vault_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_vault_path_unique` ON `projects` (`vault_path`);