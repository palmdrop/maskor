import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projectsTable = sqliteTable("projects", {
  uuid: text("uuid").primaryKey(),
  // TODO: add FK reference to usersTable when multi-user/hosting is introduced
  userUuid: text("user_uuid").notNull().default("local"),
  name: text("name").notNull(),
  vaultPath: text("vault_path").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
