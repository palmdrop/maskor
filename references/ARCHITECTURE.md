# Maskor Architecture

**Date**: 07-04-2026

---

## Purpose

Maskor is a local-first, fragmented writing tool. Users write in disconnected units (fragments), assign thematic dimensions (aspects) and weights, then use an arc-guided sequencer to arrange them into a coherent whole. An Obsidian-compatible markdown vault is the permanent, human-editable source of truth. A SQLite index derived from the vault enables fast queries. All DB-only data (sequences, fitting scores, arc positions) can be lost and re-derived; vault data cannot.

---

## Monorepo Structure

| Package     | Role                                                                          | Status     |
| ----------- | ----------------------------------------------------------------------------- | ---------- |
| `shared`    | Domain types, branded UUIDs, slugify util, pino logger factory                | Built      |
| `storage`   | Vault I/O, parse/serialize, mappers, SQLite index, project registry           | Built      |
| `api`       | OpenAPIHono HTTP API — fragments, aspects, notes, references, projects, index | Built      |
| `processor` | Processing queue — enriches/validates pieces → fragments                      | Scaffolded |
| `sequencer` | Arc-fitting engine, deterministic placement with seeded noise                 | Scaffolded |
| `importer`  | Converts external files (.docx etc.) to fragments via Pandoc                  | Scaffolded |
| `frontend`  | React + Vite UI — editor, sequencer view, arc overview                        | Scaffolded |

Scaffolded = `src/index.ts` + test stub only. No business logic yet.

Runtime: **Bun** throughout (except `frontend`, which uses Vite/Vitest). Workspaces in root `package.json`. TypeScript everywhere. Packages reference each other via `workspace:*`.

---

## Domain Model

### Entities

```
Fragment ──── has many ──→ FragmentProperty { aspectKey, weight }
             ──── references ──→ Note[] (by title)
             ──── references ──→ Reference[] (by name)

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

### Field ownership

| Field / Data              | Owner        | Notes                                                |
| ------------------------- | ------------ | ---------------------------------------------------- |
| `uuid`, `title`,          | Vault (file) | Written by Maskor on first creation; user may edit   |
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
        │  VaultWatcher (chokidar) → incremental upserts on add/change/unlink
        │  VaultIndexer.rebuild() — full O(n) scan on startup
        ▼
  <vault>/.maskor/vault.db    (SQLite — content index, per-vault)
        │
        ├── VaultIndexer queries (findByUUID, findAll…)
        │
        ▼
  StorageService               (project-aware factory, in-process caches)
        │
        ▼
  @maskor/api  (OpenAPIHono — wired, StorageService injected via Hono context)
        │
        ├── GET /doc         → OpenAPI JSON spec
        ├── GET /ui          → Swagger UI
        ├── /projects        → project CRUD (no ProjectContext required)
        └── /projects/:projectId/*  → resolveProject middleware → ProjectContext
                ├── /fragments   (CRUD)
                ├── /aspects     (read-only)
                ├── /notes       (read-only)
                ├── /references  (read-only)
                └── /index/rebuild  (POST)
        │
        ▼
  @maskor/frontend  (React + Vite — not yet wired)


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
                │  registerProject / listProjects /    │  In-process caches (Map per projectUUID)
                │  resolveProject / removeProject      │  Vault + indexer + DB lazily instantiated
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

### StorageService namespaced API

`getVault`, `getVaultDatabase`, `getVaultIndexer` are private. All callers use the namespaced surface:

| Namespace            | Methods                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `service.fragments`  | `read`, `readAll`, `write`, `discard`                                              |
| `service.aspects`    | `read`, `readAll`, `write`                                                         |
| `service.notes`      | `read`, `readAll`, `write`                                                         |
| `service.references` | `read`, `readAll`, `write`                                                         |
| `service.pieces`     | `consumeAll`                                                                       |
| `service.index`      | `rebuild`                                                                          |
| `service.watcher`    | `start`, `stop`                                                                    |
| (top-level)          | `registerProject`, `listProjects`, `getProject`, `resolveProject`, `removeProject` |

All vault paths are **relative to vault root**. A `resolvePath` guard enforces this with `PATH_OUT_OF_BOUNDS` on traversal attempts.

`FILE_NOT_FOUND` from vault is re-thrown as `STALE_INDEX` at index-derived call sites (file expected from index is now gone).

| Layer      | File(s)                       | Responsibility                                          |
| ---------- | ----------------------------- | ------------------------------------------------------- |
| Parse      | `vault/markdown/parse.ts`     | raw string → `ParsedFile` (fm + inline + body)          |
| Serialize  | `vault/markdown/serialize.ts` | domain parts → markdown string                          |
| Mappers    | `vault/markdown/mappers/*.ts` | `ParsedFile` ↔ domain types                             |
| Vault      | `vault/markdown/vault.ts`     | File I/O via `Bun.file` / `Bun.write`                   |
| Indexer    | `indexer/indexer.ts`          | Full rebuild + DB-backed queries                        |
| Upserts    | `indexer/upserts.ts`          | Per-entity upsert helpers (shared by indexer + watcher) |
| Assemblers | `indexer/assemblers.ts`       | DB rows → `IndexedFragment` / `IndexedAspect`           |
| Watcher    | `watcher/watcher.ts`          | Chokidar watcher → incremental DB sync                  |
| Registry   | `registry/registry.ts`        | Project CRUD against `registry.db`                      |
| Service    | `service/storage-service.ts`  | Composes vault + indexer + watcher + registry           |

### Two databases

| Database    | Location                       | Schema file             | Purpose                   |
| ----------- | ------------------------------ | ----------------------- | ------------------------- |
| Registry DB | `~/.config/maskor/registry.db` | `db/registry/schema.ts` | Project UUID → vault path |
| Vault DB    | `<vault>/.maskor/vault.db`     | `db/vault/schema.ts`    | Content index (derived)   |

Both use `bun:sqlite` + Drizzle ORM + migration runner.

---

## API Package (`@maskor/api`)

Framework: **OpenAPIHono** (`@hono/zod-openapi`). All routes use `createRoute()` + `.openapi()` — Zod-validated request/response, spec-annotated.

### Context injection pattern

`StorageService` is constructed once at startup and injected via middleware:

```
createApp(storageService) → sets ctx.var.storageService on every request
```

Project-scoped routes (`/projects/:projectId/*`) run `resolveProject` middleware first → calls `storageService.resolveProject(projectId)` → sets `ctx.var.projectContext`. Route handlers call `ctx.get("projectContext")` — no direct registry access from routes.

### Zod schemas

All request/response shapes in `packages/api/src/schemas/`:

| File             | Covers                                                        |
| ---------------- | ------------------------------------------------------------- |
| `fragment.ts`    | `FragmentSchema`, `FragmentCreateSchema`, query/param schemas |
| `project.ts`     | `ProjectSchema`, `ProjectCreateSchema`, param schema          |
| `aspect.ts`      | `AspectSchema`                                                |
| `note.ts`        | `NoteSchema`                                                  |
| `reference.ts`   | `ReferenceSchema`                                             |
| `error.ts`       | `ErrorResponseSchema`                                         |
| `vault-index.ts` | Rebuild response schema                                       |

### Error handling

`packages/api/src/errors.ts` maps `VaultError` codes to HTTP responses:

| `VaultErrorCode`     | HTTP |
| -------------------- | ---- |
| `FRAGMENT_NOT_FOUND` | 404  |
| `ENTITY_NOT_FOUND`   | 404  |
| `STALE_INDEX`        | 409  |
| `PATH_OUT_OF_BOUNDS` | 400  |
| `PROJECT_NOT_FOUND`  | 404  |
| (unknown)            | 500  |

---

## Sync Contract (summary)

- **Vault owns:** uuid, title, version, readyStatus, notes[], references[], inline aspect weights, body content.
- **DB owns:** contentHash, updatedAt/syncedAt, sequence positions, fitting scores, arc positions, filePath index.
- **UUID assignment:** Written into frontmatter on first detection if missing. Never changes. Entities tracked by UUID, not filename.
- **Rebuild:** Full O(n) scan, single SQLite transaction. Inserts/updates all entities. Soft-deletes entities absent from vault (`deletedAt`). Never hard-deletes fragments — moves to `discarded`.
- **Aspect key resolution:** Inline fields stored by string key, UUID resolved at rebuild. Unresolved keys → `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }`. Maskor never auto-rewrites fragment files.
- **Conflicts:** Last-write-wins for most fields. Stale `version` is a warning, not an error.
- **Stale index window:** Index is stale after any write until next `rebuild()`. `STALE_INDEX` = file expected from index is missing. Treat as retryable. Closes once chokidar is integrated.

---

## Key Design Decisions & Constraints

| Decision                        | Rationale                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Vault = source of truth         | Human-readable, Obsidian-compatible, survives DB loss                          |
| DB = derived cache              | Fast queries without full file scans; always re-derivable from vault           |
| SQLite (not Postgres)           | Local-first; no server process; `bun:sqlite` is native                         |
| Two separate SQLite DBs         | Registry is global (user config dir); vault DB travels with the vault          |
| Drizzle ORM                     | Type-safe queries; schema-as-code; migration runner built-in                   |
| Inline fields (Dataview syntax) | Aspect weights visible and editable in Obsidian without plugins                |
| `gray-matter` for frontmatter   | Battle-tested YAML parse/stringify; Obsidian-compatible                        |
| `pino` logger in `shared`       | Structured JSON logging; passed via `VaultConfig.logger` for testability       |
| Factory functions, not classes  | Consistent pattern across all packages (`createVault`, `createStorageService`) |
| Single transaction on rebuild   | Atomicity + batched disk flushes = consistent state + performance              |
| OpenAPIHono + Zod               | Type-safe routes, OpenAPI spec generated from code, no separate schema file    |
| StorageService namespaced API   | Encapsulates vault/indexer internals; consumers never touch raw DB or vault    |
| Relative vault paths            | All file operations relative to vault root; `resolvePath` blocks traversal     |

### Open / unsettled

- **File watcher**: Chokidar integrated (`VaultWatcher`). Started lazily on first project access via `resolveProject` middleware. Rebuild + start is the recommended startup sequence.
- **Frontend shell**: Tauri vs Electron vs browser-only — undecided. `@maskor/frontend` is plain Vite/React with no shell.
- **`Interleaving` type**: Stub only — `TODO: No idea how to configure this`.
- **`Action` type**: `execute` and `revert` are function fields — not serializable if actions are logged to disk.
- **Sequences/Sections DB schema**: No tables yet in `vault/schema.ts`.
- **`contentHash` on create**: `POST /fragments` sets `contentHash: ""` — downstream consumers must not rely on it until fixed.

---

## Known Structural Debt

- `rebuild()` holds all vault data in memory before writing — needs chunked approach for large vaults.
- No DB indexes on hot columns (`deleted_at`) in `vault/schema.ts`.
- `Piece` has no UUID — intentional (transient), but `consumeAll` uses filename as title, which is fragile.
- Registry manifest recovery (`recoverFromManifests`) not implemented — DB loss cannot self-heal from vault manifests.
- After `write()` or `discard()`, the inline DB update closes the stale-index window immediately. The watcher fires afterward and hash-guards to a no-op.
- `cors()` with no args allows all origins — must be restricted before any auth integration.
- Fragment title rename via `write()` creates a new file at the new slug path — old file becomes an orphan until next rebuild soft-deletes it.
