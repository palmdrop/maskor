# Storage Package — Coding Guide

Runtime: **Bun**. Use `bun` / `bun test` throughout. Never use Node equivalents.

## Package role

Three concerns, strictly separated:

1. **Vault** (`src/vault/`) — file I/O against the Obsidian vault. All paths are relative to vault root.
2. **Indexer** (`src/indexer/`) — Drizzle + `bun:sqlite` index of vault contents. Read queries only; `rebuild()` is the write path.
3. **StorageService** (`src/service/`) — project-aware facade. The only thing consumers should import.

Consumers never touch `Vault` or `VaultIndexer` directly.

## StorageService

Created once per process with an optional config directory (defaults to `~/.config/maskor`):

```ts
const service = createStorageService({ configDirectory: "/tmp/test-config" });
```

All vault operations require a `ProjectContext` resolved first:

```ts
const context = await service.resolveProject(projectUUID); // throws ProjectNotFoundError if missing

await service.fragments.readAll(context);
await service.fragments.read(context, uuid);
await service.fragments.write(context, fragment);
await service.fragments.discard(context, uuid);
await service.aspects.readAll(context);
await service.aspects.read(context, uuid);
await service.notes.readAll(context);
await service.references.readAll(context);
await service.index.rebuild(context);
```

Registry operations take no context:

```ts
await service.registerProject(name, vaultPath);
await service.listProjects();
await service.removeProject(projectUUID);
```

## Two databases

| DB | Location | Schema | Drizzle config |
|----|----------|--------|----------------|
| Registry | `~/.config/maskor/registry.db` | `src/db/registry/schema.ts` | `drizzle.config.ts` |
| Vault | `<vault>/.maskor/vault.db` | `src/db/vault/schema.ts` | `drizzle.vault.config.ts` |

Both use `bun:sqlite` + Drizzle. Migrations run automatically at DB init via `migrate()` — never via CLI at runtime.

## Drizzle schemas

Schema files describe the DB shape; they are not domain types. Keep them in `src/db/*/schema.ts`.

- `deletedAt` — soft-delete timestamp. `NULL` = active. Always filter `IS NULL` in queries.
- File paths stored in DB are **relative to vault root** (e.g. `fragments/my-fragment.md`).
- `userUuid` defaults to `"local"` — reserved for future multi-user support.

To generate a migration after a schema change:

```bash
# Registry DB
bunx drizzle-kit generate --config=drizzle.config.ts

# Vault DB
bunx drizzle-kit generate --config=drizzle.vault.config.ts
```

Commit generated migration files. Never edit them by hand.

## Vault paths

All paths passed to `Vault` methods are **relative to vault root**. The `resolvePath` guard throws `VaultError("PATH_OUT_OF_BOUNDS")` on any `../` traversal attempt. Never construct absolute paths from outside the vault layer.

## Error types

```ts
// Vault-level errors
throw new VaultError("FRAGMENT_NOT_FOUND", "Fragment not found: ...", { uuid });

// VaultErrorCode values:
// FILE_NOT_FOUND | FILE_ALREADY_EXISTS | FILE_DELETE_FAILED | FILE_MOVE_FAILED
// PATH_OUT_OF_BOUNDS | FRAGMENT_NOT_FOUND | ENTITY_NOT_FOUND
// PIECE_CONSUME_FAILED | STALE_INDEX

// Registry-level error
throw new ProjectNotFoundError(projectUUID);
```

`STALE_INDEX` is thrown when a UUID resolves to an index path that no longer exists on disk. Callers should treat it as a signal to rebuild.

## Domain types

Import all domain types from `@maskor/shared`. Do not re-declare `Fragment`, `Aspect`, `Note`, etc. inside this package.

```ts
import type { Fragment, FragmentUUID, Aspect, Pool } from "@maskor/shared";
```

Indexed types (`IndexedFragment`, `IndexedAspect`, etc.) are storage-internal and live in `src/indexer/types.ts` — export only what consumers need.

## Adding a new entity type

1. Add table(s) to the relevant schema file and generate a migration.
2. Add `findByUUID` / `findAll` queries to `src/indexer/indexer.ts` and update `src/indexer/types.ts`.
3. Add an assembler in `src/indexer/assemblers.ts` (DB row → typed object).
4. Add vault read/write methods to `src/vault/markdown/vault.ts` + a mapper in `src/vault/markdown/mappers/`.
5. Expose namespaced methods on `StorageService` in `src/service/storage-service.ts`.
