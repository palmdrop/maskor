# Maskor Architecture

**Date**: 05-04-2026

---

## Purpose

Maskor is a local-first, fragmented writing tool. The user writes in disconnected units called fragments, assigns thematic dimensions (aspects) and weights to each, then uses an arc-guided sequencer to arrange them into a coherent whole. An Obsidian-compatible markdown vault is the permanent, human-editable source of truth. A SQLite index derived from the vault enables fast queries without full file scans. All DB-only data (sequences, fitting scores, arc positions) can be lost and re-derived or re-entered; vault data cannot.

---

## Monorepo Structure

| Package     | Role                                                                | Status     |
| ----------- | ------------------------------------------------------------------- | ---------- |
| `shared`    | Domain types, branded UUIDs, slugify util, pino logger factory      | Built      |
| `storage`   | Vault I/O, parse/serialize, mappers, SQLite index, project registry | Built      |
| `api`       | Hono HTTP API — fragments, aspects, sequences, projects             | Scaffolded |
| `processor` | Processing queue — enriches/validates pieces → fragments            | Scaffolded |
| `sequencer` | Arc-fitting engine, deterministic placement with seeded noise       | Scaffolded |
| `importer`  | Converts external files (.docx etc.) to fragments via Pandoc        | Scaffolded |
| `frontend`  | React + Vite UI — editor, sequencer view, arc overview              | Scaffolded |

Scaffolded = `src/index.ts` + test stub only. No business logic yet.

Runtime: **Bun** throughout (except `frontend`, which uses Vite/Vitest). Workspaces declared in root `package.json`. TypeScript everywhere. Packages reference each other via `workspace:*`.

---

## Domain Model

### Entities

```
Fragment ──── has many ──→ FragmentProperty { aspectKey, weight }
             ──── references ──→ Note[] (by title)
             ──── references ──→ Reference[] (by name)
             ──── belongs to ──→ Pool (lifecycle state)

Aspect   ──── identified by ──→ key (unique slug)
             ──── has many ──→ Note[] (by title)
             ──── drives ──→ Arc { movement: number[] }

Sequence ──── has many ──→ Section
Section  ──── has ordered ──→ FragmentPosition { fragmentUUID, position }

Project  ──── points at ──→ vaultPath (Obsidian vault)
             ──── has many ──→ Aspect[]
             ──── has many ──→ Arc[]
             ──── has many ──→ Note[]

Piece    ──── transient ──→ becomes Fragment on consume
```

### Pool lifecycle

```
unprocessed → incomplete → unplaced → (placed in Sequence) → discarded
```

`placed` is not a pool value — placement is tracked in Sequence/Section, not on the fragment itself.

### Field ownership

| Field / Data              | Owner        | Notes                                                |
| ------------------------- | ------------ | ---------------------------------------------------- |
| `uuid`, `title`, `pool`   | Vault (file) | Written by Maskor on first creation; user may edit   |
| `version`                 | Vault (file) | Maskor increments on each sync write                 |
| `readyStatus`             | Vault (file) | User-set; Maskor may auto-generate but file wins     |
| `notes[]`, `references[]` | Vault (file) | Stored as title arrays in frontmatter                |
| Inline aspect fields      | Vault (file) | `aspect-name:: 0.8` — Dataview-compatible            |
| `content` (body)          | Vault (file) | Maskor never modifies                                |
| `contentHash`             | DB only      | SHA of body at last sync                             |
| `updatedAt`, `syncedAt`   | DB only      | Set by Maskor on sync                                |
| Sequence positions        | DB only      | All ordering data — never written to files           |
| Fitting scores            | DB only      | Computed from aspects + arcs + position context      |
| Arc positions             | DB only      | Where fragment sits on arc at current sequence index |
| `filePath` (index)        | DB only      | Populated during rebuild; tracks UUID → path mapping |

---

## Data Flow

```
  Obsidian / user edits
        │
        ▼
  <vault>/fragments/*.md
  <vault>/aspects/*.md
  <vault>/notes/*.md
  <vault>/references/*.md
  <vault>/pieces/         ← drop zone for raw imports
        │
        │  (future: chokidar file watcher → incremental upserts)
        │  (current: VaultIndexer.rebuild() — full O(n) scan)
        ▼
  <vault>/.maskor/vault.db    (SQLite — content index, per-vault)
        │
        ├── VaultIndexer queries (findByUUID, findByPool, findAll…)
        │
        ▼
  StorageService               (project-aware factory, in-process caches)
        │
        ▼
  @maskor/api  (Hono — not yet wired)
        │
        ▼
  @maskor/frontend  (React + Vite)


  ~/.config/maskor/registry.db  (SQLite — project registry, global)
        │
        └── maps projectUUID → vaultPath
        └── writes .maskor/project.json manifest on registration
```

### Piece import path (current)

```
<vault>/pieces/<title>.md
        │
        ▼  vault.pieces.consumeAll()
  initFragment() → writes <vault>/fragments/<slug>.md + returns Fragment
        │
        ▼  piece file deleted (fs.unlink)
```

Full import pipeline (`@maskor/importer` with Pandoc for `.docx`) is not yet built.

---

## Storage Package Layers

```
                ┌─────────────────────────────────────┐
                │         StorageService               │  Project-aware factory
                │  resolveProject / getVault /         │  In-process caches (Map)
                │  getVaultIndexer                     │
                └────────────┬────────────┬────────────┘
                             │            │
                ┌────────────▼──┐  ┌──────▼──────────────┐
                │    Vault      │  │    VaultIndexer       │
                │  (file I/O)   │  │  (drizzle + SQLite)   │
                └────┬──────────┘  └──────────────────────┘
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
    parse.ts    serialize.ts   mappers/
    (gray-matter) (gray-matter) fragment / aspect / note / reference
```

| Layer      | File(s)                       | Responsibility                                 |
| ---------- | ----------------------------- | ---------------------------------------------- |
| Parse      | `vault/markdown/parse.ts`     | raw string → `ParsedFile` (fm + inline + body) |
| Serialize  | `vault/markdown/serialize.ts` | domain parts → markdown string                 |
| Mappers    | `vault/markdown/mappers/*.ts` | `ParsedFile` ↔ domain types                    |
| Vault      | `vault/markdown/vault.ts`     | File I/O via `Bun.file` / `Bun.write`          |
| Indexer    | `indexer/indexer.ts`          | Full rebuild + DB-backed queries               |
| Assemblers | `indexer/assemblers.ts`       | DB rows → `IndexedFragment` / `IndexedAspect`  |
| Registry   | `registry/registry.ts`        | Project CRUD against `registry.db`             |
| Service    | `service/storage-service.ts`  | Composes vault + indexer + registry            |

### Two databases

| Database    | Location                       | Schema file             | Purpose                   |
| ----------- | ------------------------------ | ----------------------- | ------------------------- |
| Registry DB | `~/.config/maskor/registry.db` | `db/registry/schema.ts` | Project UUID → vault path |
| Vault DB    | `<vault>/.maskor/vault.db`     | `db/vault/schema.ts`    | Content index (derived)   |

Both use `bun:sqlite` + Drizzle ORM + migration runner.

---

## Sync Contract (summary)

**Vault owns:** uuid, title, pool, version, readyStatus, notes[], references[], inline aspect weights, body content.

**DB owns:** contentHash, updatedAt/syncedAt, sequence positions, fitting scores, arc positions, filePath index.

**UUID assignment:** Maskor writes `uuid` into frontmatter on first detection if missing. UUID never changes. Entities tracked by UUID, not filename.

**Rebuild semantics:** Full O(n) scan over all vault files. Upserts all entities in a single SQLite transaction. Soft-deletes entities absent from vault (`deletedAt` timestamp). Never hard-deletes fragments — moves to `discarded` pool.

**Aspect key resolution:** Inline fields (`aspect-name:: 0.8`) stored by string key. UUID resolved at rebuild via `aspectKeyToUuid` map. Unresolved keys produce `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }` — user prompted to fix, Maskor never auto-rewrites fragment files.

**Conflict rules:** last-write-wins for most fields. `pool` defers to file on conflict. Stale `version` is a warning, not an error.

---

## Key Design Decisions & Constraints

| Decision                        | Rationale                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Vault = source of truth         | Human-readable, Obsidian-compatible, survives DB loss                            |
| DB = derived cache              | Fast queries without full file scans; always rebuildable                         |
| SQLite (not Postgres)           | Local-first; no server process; `bun:sqlite` is native                           |
| Two separate SQLite DBs         | Registry is global (user config dir); vault DB travels with the vault            |
| Drizzle ORM                     | Type-safe queries; schema-as-code; migration runner built-in                     |
| Branded UUIDs (`ts-brand`)      | Prevents passing a `FragmentUUID` where `AspectUUID` is expected at compile time |
| Inline fields (Dataview syntax) | Aspect weights visible and editable in Obsidian without plugins                  |
| `gray-matter` for frontmatter   | Battle-tested YAML parse/stringify; Obsidian-compatible                          |
| `pino` logger in `shared`       | Structured JSON logging; passed via `VaultConfig.logger` for testability         |
| Factory functions, not classes  | Consistent pattern across all packages (`createVault`, `createStorageService`)   |
| Single transaction on rebuild   | Atomicity + batched fsyncs = consistent state + performance                      |

### Open / unsettled

- **API framework**: Hono is listed in `CLAUDE.md` and README but not yet installed in `@maskor/api`. NestJS mentioned in TODO as alternative. Hono is the right call — lightweight, Bun-native, minimal overhead.
- **File watcher**: Chokidar planned. Not yet integrated. `rebuild()` is the current sync mechanism.
- **Frontend shell**: Tauri vs Electron vs browser-only — undecided. `@maskor/frontend` currently plain Vite/React with no shell.
- **`Interleaving` type**: Stub only — `TODO: No idea how to configure this`.
- **`Action` type**: `execute` and `revert` are function fields on the type, which cannot be serialized. Needs rethinking if actions are to be logged to disk.
- **`Pool` as enum vs entity**: Commented-out entity version exists in `pool.ts`. Current flat union is correct; keep it unless sectioned pools with custom rules are needed.
- **Sequences/Sections DB schema**: Not yet in `vault/schema.ts` — no tables exist for `sequences` or `sections` yet.

---

## Packages Not Yet Built

| Package     | Intended role                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `api`       | Hono server. Constructs `StorageService` at startup, injects via context. Routes: fragments CRUD, aspects, sequences, projects.     |
| `processor` | Queue consumer. Converts `unprocessed` pieces to `incomplete` fragments. Enriches metadata. Likely Bun's built-in `Queue` or Redis. |
| `sequencer` | Arc-fitting engine. Takes fragments + arcs + interleaving config → ordered sequence. Deterministic + seeded noise.                  |
| `importer`  | Invokes Pandoc to convert `.docx`/PDF → markdown. Writes result to `<vault>/pieces/`.                                               |
| `frontend`  | Fragment editor (one fragment at a time, scoring-based random pull), sequencer view, arc overview with D3.                          |

---

## Known Structural Debt

- `vault.fragments.discard()` does a full O(n) file scan to find a fragment by UUID — TODO comment in source. Should use `VaultIndexer.fragments.findFilePath()` once the indexer is wired in.
- `rebuild()` holds all vault data in memory before writing. Acceptable now; chunked approach needed for large vaults.
- No DB indexes on hot columns (`pool`, `deleted_at`) in `vault/schema.ts`.
- `Piece` type has no UUID — intentional (transient), but `consumeAll` uses the filename as title, which is fragile.
- [NOTE: resolved] `Project` domain type embeds `notes: Note[]` and `aspects: Aspect[]` as full objects — will be expensive to hydrate at scale. Should be UUID references.
- Registry manifest recovery (`recoverFromManifests`) not implemented — DB loss cannot currently be self-healed from vault manifests.
