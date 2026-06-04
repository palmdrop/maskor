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
import type { SequenceOrigin } from "@maskor/shared";

export const fragmentsTable = sqliteTable(
  "fragments",
  {
    uuid: text("uuid").primaryKey(),
    key: text("key").notNull(),
    isDiscarded: integer("is_discarded", { mode: "boolean" }).notNull().default(false),
    readiness: real("readiness").notNull().default(0),
    excerpt: text("excerpt"),
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

export const fragmentAspectsTable = sqliteTable(
  "fragment_aspects",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    aspectKey: text("aspect_key").notNull(), // drift detected via Set<aspectKey> membership check
    weight: real("weight").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.aspectKey] })],
);

export const aspectsTable = sqliteTable("aspects", {
  uuid: text("uuid").primaryKey(),
  key: text("key").notNull().unique(),
  color: text("color"),
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

export const fragmentStatsTable = sqliteTable(
  "fragment_stats",
  {
    fragmentUuid: text("fragment_uuid")
      .primaryKey()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    voluntaryOpenCount: integer("voluntary_open_count").notNull().default(0),
    promptAcceptCount: integer("prompt_accept_count").notNull().default(0),
    avoidanceCount: integer("avoidance_count").notNull().default(0),
    editCount: integer("edit_count").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    lastSurfacedAt: integer("last_surfaced_at", { mode: "timestamp" }),
  },
  (table) => [index("fragment_stats_last_surfaced_at_idx").on(table.lastSurfacedAt)],
);

export const sequencesTable = sqliteTable(
  "sequences",
  {
    uuid: text("uuid").primaryKey(),
    name: text("name").notNull(),
    projectUuid: text("project_uuid").notNull(),
    isMain: integer("is_main", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    origin: text("origin", { mode: "json" }).$type<SequenceOrigin>(),
    filePath: text("file_path").notNull().unique(),
    contentHash: text("content_hash").notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sequences_project_uuid_idx").on(table.projectUuid),
    uniqueIndex("sequences_main_per_project_unique")
      .on(table.projectUuid)
      .where(sql`${table.isMain} = 1`),
  ],
);

export const sectionsTable = sqliteTable(
  "sections",
  {
    uuid: text("uuid").primaryKey(),
    name: text("name").notNull(),
    sequenceUuid: text("sequence_uuid")
      .notNull()
      .references(() => sequencesTable.uuid, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("sections_sequence_position_unique").on(table.sequenceUuid, table.position),
  ],
);

// Vault warnings surfaced to the user on the project config diagnostics tab.
// `category` distinguishes state warnings (re-detectable on rebuild, cleared when fixed)
// from event warnings (auto-resolved, persist until dismissed, never re-derived).
// `dedupKey` deduplicates state warnings per natural key (filePath / aspectKey); event
// warnings store NULL so multiple rows coexist. `payload` is the JSON SyncWarning.
export const vaultWarningsTable = sqliteTable(
  "vault_warnings",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // WRONG_FORMAT_FILE | UNKNOWN_ASPECT_KEY | UUID_COLLISION
    category: text("category").notNull(), // state | event
    dedupKey: text("dedup_key"),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    dismissedAt: integer("dismissed_at", { mode: "timestamp" }),
  },
  // SQLite treats NULLs as distinct in a unique index, so event warnings (dedupKey NULL)
  // are never deduplicated; only state warnings collide on (kind, dedupKey).
  (table) => [uniqueIndex("vault_warnings_kind_dedup_unique").on(table.kind, table.dedupKey)],
);

// A fragment's Margin (companion annotation doc). The stable join is `fragmentUuid` (the Margin
// has no UUID of its own); `fragmentKey` mirrors the filename stem. The vault file is authoritative
// — this row is a derived index for orphan detection and the future graph view.
export const marginsTable = sqliteTable("margins", {
  fragmentUuid: text("fragment_uuid").primaryKey(),
  fragmentKey: text("fragment_key").notNull(),
  notes: text("notes").notNull().default(""),
  filePath: text("file_path").notNull().unique(),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

// One row per comment in a Margin. `ordinal` preserves authoring order. Orphan state is not stored —
// the panel derives it live from the open fragment buffer (a comment whose `marker_id` is absent from
// the fragment body is an orphan).
export const commentsTable = sqliteTable(
  "comments",
  {
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => marginsTable.fragmentUuid, { onDelete: "cascade" }),
    markerId: text("marker_id").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.fragmentUuid, table.markerId] }),
    index("comments_fragment_uuid_idx").on(table.fragmentUuid),
  ],
);

// Per-vault runtime state that is not re-derivable from vault files and should not churn the
// project manifest. Single-row table (id = 1 by convention). Only add columns here for state
// that is DB-only (not stored in any vault file).
export const projectStateTable = sqliteTable("project_state", {
  id: integer("id").primaryKey().default(1).notNull(),
  currentFragmentUUID: text("current_fragment_uuid"),
});

export const fragmentPositionsTable = sqliteTable(
  "fragment_positions",
  {
    uuid: text("uuid").primaryKey(),
    fragmentUuid: text("fragment_uuid")
      .notNull()
      .references(() => fragmentsTable.uuid, { onDelete: "cascade" }),
    sectionUuid: text("section_uuid")
      .notNull()
      .references(() => sectionsTable.uuid, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("fragment_positions_section_position_unique").on(table.sectionUuid, table.position),
    index("fragment_positions_fragment_uuid_idx").on(table.fragmentUuid),
  ],
);
