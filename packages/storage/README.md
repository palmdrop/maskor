# @maskor/storage

Reads and writes the Maskor vault — a directory of human-editable markdown files that act as the source of truth for fragments, aspects, notes, and references.

Also manages a local project registry (SQLite) that maps project UUIDs to vault paths, and a per-vault content index (SQLite) that enables fast lookups without full file scans.

---

## Vault layout

```
<vault>/
  fragments/            # active fragment files
  fragments/discarded/  # discarded fragments
  aspects/              # aspect definitions
  notes/                # notes
  references/           # references
  pieces/               # consume directory — drop raw .md files here to import
  .maskor/
    project.json        # written on registerProject — marks vault as a known project
    vault.db            # content index — rebuilt from files on demand, never source of truth
```

---

## Usage

### Low-level: `createVault`

Direct vault access with no project awareness. All paths are **relative to the vault root**. Paths that escape the vault root throw `VaultError("PATH_OUT_OF_BOUNDS")`.

```ts
import { createVault } from "@maskor/storage";

const vault = createVault({ root: "/path/to/vault" });

const fragments = await vault.fragments.readAll();
const fragment = await vault.fragments.read("the-bridge.md"); // relative to fragments/
await vault.fragments.write(fragment);
// note: prefer StorageService.fragments.discard(context, uuid) over calling vault directly —
// the service handles UUID→path resolution via the index.
await vault.fragments.discard("the-bridge.md"); // discarded → "discarded/the-bridge.md"

const aspects = await vault.aspects.readAll();
const notes = await vault.notes.readAll();
const references = await vault.references.readAll();

// consume all files in pieces/ → converts to fragments, deletes source files
const newFragments = await vault.pieces.consumeAll();
```

### High-level: `createStorageService`

Project-aware wrapper. All operations are UUID-based — no file paths exposed to the caller. Vault and indexer instances are cached internally per project UUID.

```ts
import { createStorageService } from "@maskor/storage";

const service = createStorageService(); // uses ~/.config/maskor by default

// register a vault as a named project
const record = await service.registerProject("My Novel", "/path/to/vault");

// resolve a project context from its UUID (throws ProjectNotFoundError if unknown)
const context = await service.resolveProject(record.projectUUID);

// rebuild the content index (full scan; call on startup or after bulk file changes)
await service.index.rebuild(context);

// fragment operations
const fragments = await service.fragments.readAll(context); // IndexedFragment[]
const unplaced = await service.fragments.findByPool(context, "unplaced");
const fragment = await service.fragments.read(context, uuid); // full Fragment with content
await service.fragments.write(context, fragment);
await service.fragments.discard(context, uuid); // UUID-based; needs prior rebuild

// aspect / note / reference operations
const aspects = await service.aspects.readAll(context); // IndexedAspect[]
const aspect = await service.aspects.read(context, uuid);
await service.aspects.write(context, aspect);
const notes = await service.notes.readAll(context);
const references = await service.references.readAll(context);

// piece import
const newFragments = await service.pieces.consumeAll(context);

// list and remove projects
const projects = await service.listProjects();
await service.removeProject(record.projectUUID);
```

> **Index staleness:** `discard` and `write` update vault files but do not update the SQLite index. Call `service.index.rebuild(context)` after bulk mutations to bring the index back in sync. This limitation goes away when the chokidar file watcher is added.

Set `MASKOR_CONFIG_DIR` to override the registry database location (useful for tests).

---

## Architecture

### Layers

| Layer     | Files                         | Role                                                   |
| --------- | ----------------------------- | ------------------------------------------------------ |
| Parse     | `vault/markdown/parse.ts`     | Raw string → `ParsedFile`                              |
| Serialize | `vault/markdown/serialize.ts` | Domain parts → markdown string                         |
| Mappers   | `vault/markdown/mappers/*.ts` | `ParsedFile` ↔ domain types                            |
| Vault     | `vault/markdown/vault.ts`     | File I/O via `createVault`                             |
| Indexer   | `indexer/indexer.ts`          | DB-backed query layer via `createVaultIndexer`         |
| Registry  | `registry/registry.ts`        | SQLite project registry via `createProjectRegistry`    |
| Service   | `service/storage-service.ts`  | Project-aware vault factory via `createStorageService` |

### Databases

Two separate SQLite databases — different physical locations, different schemas, separate migration folders:

| Database    | Location                       | Schema                  | Purpose                       |
| ----------- | ------------------------------ | ----------------------- | ----------------------------- |
| Registry DB | `~/.config/maskor/registry.db` | `db/registry/schema.ts` | Maps project UUIDs to vaults  |
| Vault DB    | `<vault>/.maskor/vault.db`     | `db/vault/schema.ts`    | Content index (derived cache) |

### Project context flow (native mode)

```
caller
  └─ service.resolveProject(projectUUID)         →  ProjectContext
  └─ service.index.rebuild(context)              →  syncs vault files → SQLite index
  └─ service.fragments.readAll(context)          →  IndexedFragment[] (from index)
  └─ service.fragments.read(context, uuid)       →  Fragment (from vault file, via index lookup)
  └─ service.fragments.discard(context, uuid)    →  moves file; index stale until next rebuild
```

`Vault` and `VaultIndexer` are internal to the service — consumers interact with UUID-based methods only. File paths never leave the service boundary.

When hosting is introduced, a thin adapter (e.g. Hono middleware) replaces the direct `resolveProject` call — the `StorageService` interface and `ProjectContext` type stay unchanged.

---

## File format

Fragment files use YAML frontmatter + Dataview-compatible inline fields + markdown body. See [`references/SYNC_CONTRACT.md`](../../references/SYNC_CONTRACT.md).

---

## Database

Two SQLite databases are managed via Drizzle ORM. Schema lives in `src/db/*/schema.ts`; migrations in `src/db/*/migrations/`.

| Script | When to use |
|---|---|
| `bun run db:push` | **Active development** — syncs schema directly, no migration file generated |
| `bun run db:generate` | Pre-release — generate a migration from schema changes |
| `bun run db:migrate` | Apply pending migration files |

> During early development (no deployed instances), `db:push` is preferred. Switch to `db:generate` + `db:migrate` once real user data exists.

---

## Tests

```
bun test --cwd packages/storage
```

Fixtures live at `packages/storage/fixtures/vault/`. Registry and service tests use temp directories and set `MASKOR_CONFIG_DIR` for isolation.
