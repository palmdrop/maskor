import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const fragmentsTable = sqliteTable(
  "fragments",
  {
    uuid: text("uuid").primaryKey(),
    key: text("key").notNull(),
    isDiscarded: integer("is_discarded", { mode: "boolean" }).notNull().default(false),
    readyStatus: real("ready_status").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    filePath: text("file_path").notNull().unique(), // relative to vault root
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("fragments_is_discarded_idx").on(table.isDiscarded),
    // Active and discarded fragments share a key namespace by directory:
    // foo.md and discarded/foo.md may coexist, but two active fragments may not.
    uniqueIndex("fragments_active_key_unique")
      .on(table.key)
      .where(sql`${table.isDiscarded} = 0`),
    uniqueIndex("fragments_discarded_key_unique")
      .on(table.key)
      .where(sql`${table.isDiscarded} = 1`),
  ],
);

export const fragmentNotesTable = sqliteTable(
  "fragment_notes",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    noteKey: text("note_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.noteKey] })],
);

export const fragmentReferencesTable = sqliteTable(
  "fragment_references",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    referenceKey: text("reference_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.referenceKey] })],
);

export const fragmentPropertiesTable = sqliteTable(
  "fragment_properties",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    aspectKey: text("aspect_key").notNull(), // drift detected via Set<aspectKey> membership check
    weight: real("weight").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.aspectKey] })],
);

export const aspectsTable = sqliteTable("aspects", {
  uuid: text("uuid").primaryKey(),
  key: text("key").notNull().unique(),
  category: text("category"),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

export const aspectNotesTable = sqliteTable(
  "aspect_notes",
  {
    aspectUuid: text("aspect_uuid")
      .notNull()
      .references(() => aspectsTable.uuid, { onDelete: "cascade" }),
    noteKey: text("note_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.aspectUuid, table.noteKey] })],
);

export const notesTable = sqliteTable("notes", {
  uuid: text("uuid").primaryKey(),
  key: text("key").notNull().unique(),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

export const referencesTable = sqliteTable("project_references", {
  uuid: text("uuid").primaryKey(),
  key: text("key").notNull().unique(),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});
