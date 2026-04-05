# Plan: Vault Content Index

**Date**: 05-04-2026
**Status**: Done
**Implemented At**: 05-04-2026

## Context

The registry DB (`registry.db`) tracks projects. The vault (markdown files) is the source of truth for fragments, aspects, notes, and references. Currently every query that needs to find a fragment by UUID must scan all files — see the `TODO` in `vault.ts:discard()`. This plan adds a per-vault SQLite DB at `<vault>/.maskor/vault.db` that indexes vault content, enabling fast queries and content-hash-based change detection. The DB is a derived cache: it can always be fully rebuilt by scanning the vault.

---

## Key Decisions

- **Per-vault DB** at `<vault>/.maskor/vault.db`. Registry stays thin. Vaults remain self-describing and portable.
- **Full rebuild only** (`rebuild()`). Incremental file-watcher sync is a future plan.
- **Join table for fragment properties** — `(fragment_uuid, aspect_key, aspect_uuid NULLABLE, weight)`. `aspect_key` is always written from the file inline field. `aspect_uuid` is resolved at index time — `NULL` if no matching active aspect exists. Drift surfaces as a typed `SyncWarning`, not a separate post-hoc check. The watcher (future) can heal `aspect_uuid` on aspect rename without touching fragment files.
- **`VaultIndexer`** is the business logic layer. It reads from the `Vault` (file layer) and writes to the vault DB. It also exposes a query API so callers never scan files for lookups.
- **Soft deletes** — `deleted_at` is set to the current Unix ms timestamp on soft delete, `NULL` when active. Never hard-deleted (aligns with sync contract).
- No sequences/interleavings tables in this plan — those are DB-as-source-of-truth and handled separately.

---

## Schema

All tables live in `vault.db`. No `project_uuid` column — the file is already scoped to the project.

### `fragments`

```sql
CREATE TABLE fragments (
  uuid          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 0,
  pool          TEXT NOT NULL,         -- 'unprocessed' | 'incomplete' | 'unplaced' | 'discarded'
  ready_status  REAL NOT NULL DEFAULT 0,
  content_hash  TEXT NOT NULL,         -- hash of body at last sync
  file_path     TEXT NOT NULL UNIQUE,  -- absolute path; updated on rename
  deleted_at    INTEGER,               -- NULL = active; Unix ms timestamp set by Maskor on soft delete
  synced_at     INTEGER NOT NULL       -- Unix ms timestamp set by Maskor
);
```

### `fragment_notes`

```sql
CREATE TABLE fragment_notes (
  fragment_uuid TEXT NOT NULL REFERENCES fragments(uuid) ON DELETE CASCADE,
  note_title    TEXT NOT NULL,
  PRIMARY KEY (fragment_uuid, note_title)
);
```

### `fragment_references`

```sql
CREATE TABLE fragment_references (
  fragment_uuid    TEXT NOT NULL REFERENCES fragments(uuid) ON DELETE CASCADE,
  reference_name   TEXT NOT NULL,
  PRIMARY KEY (fragment_uuid, reference_name)
);
```

### `fragment_properties`

```sql
CREATE TABLE fragment_properties (
  fragment_uuid TEXT NOT NULL REFERENCES fragments(uuid) ON DELETE CASCADE,
  aspect_key    TEXT NOT NULL,             -- raw key from file inline field; always set
  aspect_uuid   TEXT REFERENCES aspects(uuid) ON DELETE SET NULL, -- NULL if key doesn't resolve
  weight        REAL NOT NULL,
  PRIMARY KEY (fragment_uuid, aspect_key)
);
```

> `aspect_uuid` is `NULL` when the key doesn't resolve to any active aspect — this is the signal for drift. It is set (or healed) during `rebuild()` and by the watcher on aspect changes. Fragment files are never modified to fix drift.

### `aspects`

```sql
CREATE TABLE aspects (
  uuid       TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,   -- unique within vault
  category   TEXT,
  file_path  TEXT NOT NULL UNIQUE,
  deleted_at INTEGER,               -- NULL = active; Unix ms timestamp set by Maskor on soft delete
  synced_at  INTEGER NOT NULL
);
```

> `description` is the file body — not stored in DB. Callers that need it read the file directly.

### `aspect_notes`

```sql
CREATE TABLE aspect_notes (
  aspect_uuid TEXT NOT NULL REFERENCES aspects(uuid) ON DELETE CASCADE,
  note_title  TEXT NOT NULL,
  PRIMARY KEY (aspect_uuid, note_title)
);
```

### `notes`

```sql
CREATE TABLE notes (
  uuid         TEXT PRIMARY KEY,
  title        TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  file_path    TEXT NOT NULL UNIQUE,
  deleted_at   INTEGER,               -- NULL = active; Unix ms timestamp set by Maskor on soft delete
  synced_at    INTEGER NOT NULL
);
```

> `content` (body) is not stored — notes are looked up by title/uuid, then read from file when body is needed.

### `references`

```sql
CREATE TABLE project_references (
  uuid         TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  file_path    TEXT NOT NULL UNIQUE,
  deleted_at   INTEGER,               -- NULL = active; Unix ms timestamp set by Maskor on soft delete
  synced_at    INTEGER NOT NULL
);
```

---

## Drizzle Schema (`vault-db/schema.ts`)

```typescript
export const fragmentsTable = sqliteTable("fragments", {
  uuid: text("uuid").primaryKey(),
  title: text("title").notNull(),
  version: integer("version").notNull().default(0),
  pool: text("pool").notNull(),
  readyStatus: real("ready_status").notNull().default(0),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

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
    aspectUuid: text("aspect_uuid").references(() => aspectsTable.uuid, { onDelete: "set null" }), // nullable
    weight: real("weight").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentUuid, table.aspectKey] })],
);

export const aspectsTable = sqliteTable("aspects", {
  uuid: text("uuid").primaryKey(),
  key: text("key").notNull().unique(),
  category: text("category"),
  filePath: text("file_path").notNull().unique(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

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

export const notesTable = sqliteTable("notes", {
  uuid: text("uuid").primaryKey(),
  title: text("title").notNull().unique(),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

export const referencesTable = sqliteTable("project_references", {
  uuid: text("uuid").primaryKey(),
  name: text("name").notNull().unique(),
  contentHash: text("content_hash").notNull(),
  filePath: text("file_path").notNull().unique(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }), // NULL = active
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});
```

---

## `VaultDatabase` (`vault-db/index.ts`)

Opens or creates `<vault>/.maskor/vault.db`. Runs migrations at init (same pattern as `createRegistryDatabase`).

```typescript
export type VaultDatabase = ReturnType<typeof createVaultDatabase>;

export const createVaultDatabase = (vaultRoot: string): VaultDatabase => {
  const maskorDirectory = join(vaultRoot, ".maskor");
  mkdirSync(maskorDirectory, { recursive: true });

  const database = new Database(join(maskorDirectory, "vault.db"));
  const vaultDatabase = drizzle(database, { schema });

  migrate(vaultDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });

  return vaultDatabase;
};
```

Drizzle config: a second `drizzle.config.ts` target (or a second entry in the existing one) pointing at `vault-db/schema.ts` with a separate migrations folder.

---

## `VaultIndexer` (`index/indexer.ts`)

The indexer reads from the `Vault` (file layer) and writes to the `VaultDatabase`. It also provides a query API.

### Interface

```typescript
// Discriminated union — extend with new kinds as new sync checks are added.
type SyncWarning = {
  kind: "UNKNOWN_ASPECT_KEY";
  aspectKey: string;
  fragmentUuids: FragmentUUID[];
};

type RebuildStats = {
  fragments: number;
  aspects: number;
  notes: number;
  references: number;
  durationMs: number;
  warnings: SyncWarning[]; // all warnings emitted during rebuild; empty if clean
};

type IndexedFragmentProperty = {
  weight: number;
  aspectUuid: AspectUUID | null; // null = aspect key didn't resolve; surface as warning
};

type IndexedFragment = {
  uuid: FragmentUUID;
  title: string;
  version: number;
  pool: Pool;
  readyStatus: number;
  contentHash: string;
  filePath: string;
  notes: string[]; // note titles
  references: string[]; // reference names
  properties: Record<string, IndexedFragmentProperty>; // keyed by aspect_key
};

type IndexedAspect = {
  uuid: AspectUUID;
  key: string;
  category?: string;
  filePath: string;
  notes: string[];
};

type IndexedNote = {
  uuid: NoteUUID;
  title: string;
  filePath: string;
};

type IndexedReference = {
  uuid: ReferenceUUID;
  name: string;
  filePath: string;
};

interface VaultIndexer {
  rebuild(): Promise<RebuildStats>;

  fragments: {
    findAll(): Promise<IndexedFragment[]>;
    findByUUID(uuid: FragmentUUID): Promise<IndexedFragment | null>;
    findByPool(pool: Pool): Promise<IndexedFragment[]>;
    findFilePath(uuid: FragmentUUID): Promise<string | null>;
  };

  aspects: {
    findAll(): Promise<IndexedAspect[]>;
    findByKey(key: string): Promise<IndexedAspect | null>;
  };

  notes: {
    findAll(): Promise<IndexedNote[]>;
    findByTitle(title: string): Promise<IndexedNote | null>;
  };

  references: {
    findAll(): Promise<IndexedReference[]>;
    findByName(name: string): Promise<IndexedReference | null>;
  };
}
```

### `rebuild()` algorithm

1. Record start time. Initialise `warnings: SyncWarning[]`.
2. Index **aspects** first — build an in-memory `Map<aspectKey, aspectUuid>` from the results for use in step 4.
   a. `vault.aspects.readAll()`.
   b. Upsert each into `aspectsTable` (`ON CONFLICT (uuid) DO UPDATE`).
   c. Delete + re-insert `aspect_notes` rows.
   d. Mark UUIDs absent from the vault as `deleted_at = now()`.
3. Index **notes**, then **references** — same upsert + soft-delete pattern. No resolution needed.
4. Index **fragments** last.
   a. `vault.fragments.readAll()`.
   b. Upsert each into `fragmentsTable`.
   c. Delete + re-insert `fragment_notes` and `fragment_references` rows.
   d. For each inline property (`aspect_key`, `weight`): look up `aspect_key` in the map from step 2.
   - **Found** → insert `(fragment_uuid, aspect_key, aspect_uuid, weight)`.
   - **Not found** → insert `(fragment_uuid, aspect_key, NULL, weight)`. Accumulate into a `Map<aspectKey, fragmentUuid[]>` for warning collection. Log at `warn` level: `{ aspectKey, fragmentUuid }`.
     e. Mark fragment UUIDs absent from the vault as `deleted_at = now()`.
5. Emit one `SyncWarning { kind: "UNKNOWN_ASPECT_KEY", aspectKey, fragmentUuids }` per unresolved key collected in step 4d.
6. Return `RebuildStats` with counts, `durationMs`, and `warnings`.

Order matters: **aspects → notes → references → fragments**. Aspects are indexed first so the resolution map is available when fragments are processed. Warnings are a natural byproduct of the resolution step — no separate drift check needed.

### Factory

```typescript
export const createVaultIndexer = (
  vaultDatabase: VaultDatabase,
  vault: Vault,
): VaultIndexer => { ... };
```

---

## Integration with `StorageService`

`StorageService` gains two new methods:

```typescript
interface StorageService {
  // ... existing methods ...
  getVaultDatabase(context: ProjectContext): VaultDatabase; // lazy, cached per projectUUID
  getVaultIndexer(context: ProjectContext): VaultIndexer; // lazy, cached per projectUUID
}
```

`getVaultDatabase` opens/creates the vault DB on first call and caches it alongside the `Vault` instance. `getVaultIndexer` composes the cached vault + vault DB into a `VaultIndexer`.

---

## File Structure

```
packages/storage/src/
  db/
    index.ts                        ← existing: createRegistryDatabase
    schema.ts                       ← existing: projectsTable
    migrations/                     ← existing: registry migrations
    vault-db/
      index.ts                      ← new: createVaultDatabase
      schema.ts                     ← new: all vault content tables
      migrations/                   ← new: vault DB migration files
        0000_create_vault_tables.sql
        meta/
          _journal.json
          0000_snapshot.json
  index/
    types.ts                        ← new: IndexedFragment, IndexedAspect, IndexedNote, IndexedReference, RebuildStats
    indexer.ts                      ← new: createVaultIndexer
    index.ts                        ← new: re-exports
  registry/                         ← existing
  service/
    storage-service.ts              ← extend: getVaultDatabase, getVaultIndexer
    index.ts                        ← existing
  backend/                          ← unchanged
  index.ts                          ← extend exports
```

---

## Drizzle Config

The existing `drizzle.config.ts` targets `src/db/schema.ts`. Add a second config file `drizzle.vault.config.ts` pointing at `src/db/vault-db/schema.ts` with output to `src/db/vault-db/migrations/`. Generate migrations with:

```bash
bunx drizzle-kit generate --config drizzle.vault.config.ts
```

---

## Critical Files

| File                                              | Action                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/storage/src/db/vault-db/schema.ts`      | New — all vault content tables                                                              |
| `packages/storage/src/db/vault-db/index.ts`       | New — `createVaultDatabase`                                                                 |
| `packages/storage/src/db/vault-db/migrations/`    | New — vault DB migration files                                                              |
| `packages/storage/src/index/types.ts`             | New — `IndexedFragment`, `IndexedAspect`, `IndexedNote`, `IndexedReference`, `RebuildStats` |
| `packages/storage/src/index/indexer.ts`           | New — `createVaultIndexer`                                                                  |
| `packages/storage/src/service/storage-service.ts` | Extend — `getVaultDatabase`, `getVaultIndexer`                                              |
| `packages/storage/src/index.ts`                   | Extend exports                                                                              |
| `packages/storage/drizzle.vault.config.ts`        | New — second Drizzle config for vault schema                                                |

---

## Open Questions / Known Limitations

- **`description` not indexed** — aspect body is not stored in the DB. If callers need it, they read the file. Acceptable for now; revisit if aspect search-by-description is needed.
- **Note/reference body not indexed** — same reasoning as above.
- **`content` on notes/references** — `IndexedNote` and `IndexedReference` intentionally omit `content`. The file read is cheap enough when body is actually needed.
- **Stale `aspect_key` references** — if an aspect is renamed in the vault offline, `fragment_properties.aspect_uuid` will be `NULL` for affected rows after the next rebuild. This surfaces as `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }` — callers should prompt the user to resolve (rename the aspect back, or use a future Maskor repair operation that rewrites fragment inline fields). Fragment files are never auto-modified. The future watcher can heal `aspect_uuid` on live renames without touching files.
- **`vault.fragments.readAll()` reads all files** — rebuild is O(n) file reads. Acceptable for now; file watcher will make this incremental later.

---

## Verification

1. Unit tests for `createVaultIndexer`:
   - `rebuild()` against fixture vault: assert fragment/aspect/note/reference counts match fixture files.
   - `findByUUID` returns correct `IndexedFragment` including `notes`, `references`, `properties`.
   - `findByPool` filters correctly.
   - `findFilePath` returns the correct path.
   - Aspects missing from vault after rebuild have `deleted_at` set (non-null).
2. Test `fragment_properties` resolution: known aspect key → `aspect_uuid` set; unknown key → `aspect_uuid = NULL` and a `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }` in `RebuildStats.warnings`.
3. `StorageService` integration test: `getVaultIndexer(context).rebuild()` then `fragments.findAll()` returns expected count.
4. Env isolation: vault DB created inside a temp vault dir; no mutations to real vault.
5. `bun test packages/storage` — all existing vault tests still pass.
6. `bun run typecheck` — no type errors.
