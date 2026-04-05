# @maskor/storage

Reads and writes the Maskor vault — a directory of human-editable markdown files that act as the source of truth for fragments, aspects, notes, and references.

Also manages a local project registry (SQLite) that maps project UUIDs to vault paths.

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
```

---

## Usage

### Low-level: `createVault`

Direct vault access with no project awareness:

```ts
import { createVault } from "@maskor/storage";

const vault = createVault({ root: "/path/to/vault" });

const fragments = await vault.fragments.readAll();
const fragment = await vault.fragments.read("/path/to/vault/fragments/the-bridge.md");
await vault.fragments.write(fragment);
await vault.fragments.discard(fragment.uuid);

const aspects = await vault.aspects.readAll();
const notes = await vault.notes.readAll();
const references = await vault.references.readAll();

// consume all files in pieces/ → converts to fragments, deletes source files
const newFragments = await vault.pieces.consumeAll();
```

### High-level: `createStorageService`

Project-aware wrapper. Maintains a registry of known projects and caches vault instances:

```ts
import { createStorageService } from "@maskor/storage";

const service = createStorageService(); // uses ~/.config/maskor by default

// register a vault as a named project
const record = await service.registerProject("My Novel", "/path/to/vault");

// resolve a project context from its UUID
const context = await service.resolveProject(record.projectUUID);
// throws ProjectNotFoundError if UUID is unknown

// get a Vault instance (cached by project UUID)
const vault = service.getVault(context);
const fragments = await vault.fragments.readAll();

// list and remove
const projects = await service.listProjects();
await service.removeProject(record.projectUUID); // also evicts vault cache
```

Set `MASKOR_CONFIG_DIR` to override the registry database location (useful for tests).

---

## Architecture

### Layers

| Layer     | Files                           | Role                                                   |
| --------- | ------------------------------- | ------------------------------------------------------ |
| Parse     | `backend/markdown/parse.ts`     | Raw string → `ParsedFile`                              |
| Serialize | `backend/markdown/serialize.ts` | Domain parts → markdown string                         |
| Mappers   | `backend/markdown/mappers/*.ts` | `ParsedFile` ↔ domain types                            |
| Vault     | `backend/markdown/vault.ts`     | File I/O via `createVault`                             |
| Registry  | `registry/registry.ts`          | SQLite project registry via `createProjectRegistry`    |
| Service   | `service/storage-service.ts`    | Project-aware vault factory via `createStorageService` |

### Project context flow (native mode)

```
caller
  └─ service.resolveProject(projectUUID)  →  ProjectContext
  └─ service.getVault(context)            →  Vault (cached)
  └─ vault.fragments.readAll()            →  Fragment[]
```

When hosting is introduced, a thin adapter (e.g. Hono middleware) replaces the direct `resolveProject` call — the `StorageService` interface and `ProjectContext` type stay unchanged.

---

## File format

Fragment files use YAML frontmatter + Dataview-compatible inline fields + markdown body. See [`references/SYNC_CONTRACT.md`](../../references/SYNC_CONTRACT.md).

---

## Tests

```
bun test --cwd packages/storage
```

Fixtures live at `packages/storage/fixtures/vault/`. Registry and service tests use temp directories and set `MASKOR_CONFIG_DIR` for isolation.
