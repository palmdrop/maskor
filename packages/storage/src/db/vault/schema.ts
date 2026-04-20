import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const fragmentsTable = sqliteTable(
  "fragments",
  {
    uuid: text("uuid").primaryKey(),
    title: text("title").notNull(),
    version: integer("version").notNull().default(0),
    isDiscarded: integer("is_discarded", { mode: "boolean" }).notNull().default(false),
    readyStatus: real("ready_status").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    filePath: text("file_path").notNull().unique(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // Covers findAll (deleted_at IS NULL) and the soft-delete sweep in rebuild().
    index("fragments_deleted_at_idx").on(table.deletedAt),
    // Covers isDiscarded queries (is_discarded = 1 AND deleted_at IS NULL).
    index("fragments_is_discarded_deleted_at_idx").on(table.isDiscarded, table.deletedAt),
  ],
);

export const fragmentNotesTable = sqliteTable(
  "fragment_notes",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    noteTitle: text("note_title").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.noteTitle] })],
);

export const fragmentReferencesTable = sqliteTable(
  "fragment_references",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    referenceName: text("reference_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.referenceName] })],
);

export const fragmentPropertiesTable = sqliteTable(
  "fragment_properties",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    aspectKey: text("aspect_key").notNull(),
    // NULL when the aspect key doesn't resolve to an active aspect — signals drift
    aspectUuid: text("aspect_uuid").references(() => aspectsTable.uuid, { onDelete: "set null" }),
    weight: real("weight").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.aspectKey] })],
);

export const aspectsTable = sqliteTable(
  "aspects",
  {
    uuid: text("uuid").primaryKey(),
    key: text("key").notNull().unique(),
    category: text("category"),
    filePath: text("file_path").notNull().unique(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("aspects_deleted_at_idx").on(table.deletedAt)],
);

export const aspectNotesTable = sqliteTable(
  "aspect_notes",
  {
    aspectUuid: text("aspect_uuid")
      .notNull()
      .references(() => aspectsTable.uuid, { onDelete: "cascade" }),
    noteTitle: text("note_title").notNull(),
  },
  (table) => [primaryKey({ columns: [table.aspectUuid, table.noteTitle] })],
);

export const notesTable = sqliteTable(
  "notes",
  {
    uuid: text("uuid").primaryKey(),
    title: text("title").notNull().unique(),
    contentHash: text("content_hash").notNull(),
    filePath: text("file_path").notNull().unique(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("notes_deleted_at_idx").on(table.deletedAt)],
);

export const referencesTable = sqliteTable(
  "project_references",
  {
    uuid: text("uuid").primaryKey(),
    name: text("name").notNull().unique(),
    contentHash: text("content_hash").notNull(),
    filePath: text("file_path").notNull().unique(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("references_deleted_at_idx").on(table.deletedAt)],
);
