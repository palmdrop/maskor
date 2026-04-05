# Plan: Multi-Project Support & Future Hosting Readiness

**Date**: 04-04-2026
**Status**: In progress

## Context

The storage backend (`createVault`) is a dumb file-layer with no concept of project identity. The app is single-user and native today, but the user will have multiple projects (each an Obsidian vault). This plan adds a project registry, a `ProjectContext` type, and a `StorageService` that is project-aware — while keeping `createVault()` untouched.

---

## Key Decisions

- **No new package.** Extend `@maskor/storage`. The `db/index.ts` stub is already there.
- **SQLite via Drizzle + bun:sqlite** at `~/.config/maskor/registry.db`. XDG-compliant, atomic, queryable. Override via `MASKOR_CONFIG_DIR` env var for test isolation. When Tauri is integrated, replace the default path with Tauri's `appDataDir()`.
- **Per-vault manifest** at `<vault>/.maskor/project.json` — makes vaults self-describing and portable.
- **`createVault()` does not change.** `StorageService` is the project-aware wrapper above it.
- **No `usersTable` yet.** `projectsTable` has a `userUuid` text column (sentinel value `"local"` in native mode). Adding multi-user later is an additive migration — no interface changes required.

---

## Core Architecture: Context Resolution vs. Consumption

`ProjectContext` is a pure domain type — not tied to HTTP or any transport:

```typescript
type ProjectContext = {
  projectUUID: ProjectUUID;
  userUUID: UserUUID; // "local" sentinel in native mode
  vaultPath: string;
};
```

`StorageService` only **consumes** `ProjectContext`. How it is obtained is an adapter concern:

- **Native (now):** caller calls `resolveProject(uuid)` directly
- **Hosted (future):** a thin Hono middleware extracts the UUID from a JWT, calls `resolveProject`, and injects the result into request context — no changes to `StorageService` or `ProjectContext`

---

## Step 1: Multi-Project Support

### 1. Extend `Project` type in `@maskor/shared`

`packages/shared/src/types/domain/project.ts` — add `vaultPath: string` field.

### 2. New `ProjectContext` and `ProjectRecord` types

New file: `packages/storage/src/registry/types.ts`

```typescript
const LOCAL_USER_UUID = "local" as UserUUID;

type ProjectRecord = {
  projectUUID: ProjectUUID;
  userUUID: UserUUID;
  name: string;
  vaultPath: string;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectContext = {
  userUUID: UserUUID;
  projectUUID: ProjectUUID;
  vaultPath: string;
};
```

`ProjectContext` is intentionally minimal — just enough to route to the right vault.

### 3. Drizzle schema for registry

New file: `packages/storage/src/db/schema.ts`

```typescript
const projectsTable = sqliteTable("projects", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().default("local"), // sentinel; FK added when hosting is introduced
  name: text("name").notNull(),
  vaultPath: text("vault_path").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

Replace `packages/storage/src/db/index.ts` stub with `createRegistryDatabase(configDirectory)` using `bun:sqlite` and `drizzle-orm/bun-sqlite`. **Migrations must run at DB init** via Drizzle's `migrate()` — not via CLI — since there is no server startup script in a native app.

```typescript
export const createRegistryDatabase = (configDirectory: string) => {
  const database = new Database(path.join(configDirectory, "registry.db"));
  migrate(drizzle(database), { migrationsFolder: "./src/db/migrations" });
  return drizzle(database);
};
```

Default path: `~/.config/maskor` (env: `MASKOR_CONFIG_DIR`).

### 4. `ProjectRegistry` implementation

New file: `packages/storage/src/registry/registry.ts`

```typescript
createProjectRegistry(database: RegistryDatabase) => {
  registerProject(name, vaultPath): Promise<ProjectRecord>
  listProjects(): Promise<ProjectRecord[]>
  findByUUID(projectUUID): Promise<ProjectRecord | null>
  removeProject(projectUUID): Promise<void>
}
```

- `registerProject` validates that `vaultPath` exists and is a directory before writing `.maskor/project.json` inside the vault root.
- `findByUUID` returns `null` when not found — callers are responsible for throwing `ProjectNotFoundError`.

### 5. Error types

New export: `packages/storage/src/registry/errors.ts`

```typescript
class ProjectNotFoundError extends Error {
  constructor(projectUUID: ProjectUUID) {
    super(`Project not found: ${projectUUID}`);
  }
}
```

### 6. `StorageService` — project-aware vault factory

New file: `packages/storage/src/service/storage-service.ts`

```typescript
interface StorageService {
  registerProject(name, vaultPath): Promise<ProjectRecord>
  listProjects(): Promise<ProjectRecord[]>
  removeProject(projectUUID): Promise<void>
  resolveProject(projectUUID): Promise<ProjectContext>  // throws ProjectNotFoundError if not found
  getVault(context: ProjectContext): Vault              // synchronous, caches instances
}
```

- `getVault` caches `Vault` instances in a `Map<ProjectUUID, Vault>`.
- `removeProject` evicts the cached `Vault` for that project UUID.
- Callers call `resolveProject` first, then pass the result to `getVault`.

### 7. File structure inside `packages/storage/src/`

```
db/
  index.ts       ← replace stub → createRegistryDatabase (with migrate() at init)
  schema.ts      ← new: Drizzle projectsTable
  migrations/    ← new: Drizzle migration files
registry/
  types.ts       ← new: ProjectRecord, ProjectContext, LOCAL_USER_UUID
  errors.ts      ← new: ProjectNotFoundError
  registry.ts    ← new: createProjectRegistry
  index.ts       ← new: re-exports
service/
  storage-service.ts  ← new: createStorageService
  index.ts            ← new: re-exports
backend/         ← unchanged
index.ts         ← extend exports
```

### 8. Dependency additions

`packages/storage/package.json`:
- `drizzle-orm` — ORM (bun:sqlite adapter built-in)
- `drizzle-kit` (devDependency) — migration generation CLI

---

## Step 2: Hosting Readiness (design note only)

When/if the app is hosted, adding multi-user support requires:

1. Add `usersTable` + FK constraint on `projectsTable.userUuid` (additive migration)
2. Add a thin Hono middleware that extracts `projectUUID` + `userUUID` from a JWT and calls `resolveProject` — result is injected into request context
3. `resolveProject` adds an ownership check: `WHERE uuid = ? AND user_uuid = ?`

No changes to `StorageService`, `ProjectContext`, or any consumer code.

---

## Step 3: Migration Path (non-breaking)

1. `createVault()` stays unchanged — existing callers and tests continue working.
2. New `createStorageService()` is additive — nothing removed.
3. Packages that need project-aware vaults receive a `Vault` injected from outside. The service creates it; consumers don't know how.
4. Direct `createVault` calls in processor/sequencer/importer are kept until those packages need multi-project support.

---

## Critical Files

| File | Action |
|---|---|
| `packages/shared/src/types/domain/project.ts` | Add `vaultPath: string` |
| `packages/storage/src/db/index.ts` | Replace stub with `createRegistryDatabase` (runs `migrate()` at init) |
| `packages/storage/src/db/schema.ts` | New — Drizzle `projectsTable` |
| `packages/storage/src/registry/types.ts` | New — `ProjectRecord`, `ProjectContext`, `LOCAL_USER_UUID` |
| `packages/storage/src/registry/errors.ts` | New — `ProjectNotFoundError` |
| `packages/storage/src/registry/registry.ts` | New — `createProjectRegistry` |
| `packages/storage/src/service/storage-service.ts` | New — `createStorageService` |
| `packages/storage/src/index.ts` | Extend exports |
| `packages/storage/package.json` | Add `drizzle-orm`, `drizzle-kit` |

---

## Verification

1. **Unit tests** for `createProjectRegistry` — register, list, findByUUID, remove, vault path validation
2. **Integration test** for `createStorageService` — register a project against a real fixture vault, resolve project context, call `vault.fragments.readAll()`, assert fragments returned
3. **Error test** — `resolveProject` with unknown UUID throws `ProjectNotFoundError`
4. **Env isolation** — tests set `MASKOR_CONFIG_DIR` to a temp dir; no mutation of real user config
5. Run `bun test packages/storage` — all existing vault tests must still pass
6. `bun run typecheck` — no type errors across workspace
