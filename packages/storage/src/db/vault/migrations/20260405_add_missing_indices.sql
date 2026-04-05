CREATE INDEX `aspects_deleted_at_idx` ON `aspects` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `fragments_deleted_at_idx` ON `fragments` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `fragments_pool_deleted_at_idx` ON `fragments` (`pool`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `notes_deleted_at_idx` ON `notes` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `references_deleted_at_idx` ON `project_references` (`deleted_at`);