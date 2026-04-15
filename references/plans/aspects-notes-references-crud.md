# Aspects, Notes & References — Full CRUD

**Date**: 14-04-2026
**Status**: Done
**Implemented At**: 14-04-2026

---

## Goal

Add `POST /` (create) and `DELETE /:id` (hard delete) for aspects, notes, and references in `@maskor/api`. Read endpoints already exist.

---

## Current State

| Entity     | GET / | GET /:id | POST / | DELETE /:id |
| ---------- | ----- | -------- | ------ | ----------- |
| Aspects    | ✅    | ✅       | ❌     | ❌          |
| Notes      | ✅    | ✅       | ❌     | ❌          |
| References | ✅    | ✅       | ❌     | ❌          |

Storage service `write()` already exists for all three. No vault-level `delete()` exists for any of them. DB soft-delete helpers (`softDeleteAspectByFilePath`, `softDeleteNoteByFilePath`, `softDeleteReferenceByFilePath`) already exist in `packages/storage/src/indexer/upserts.ts`.

Fragments use `discard()` — a "soft delete" that moves the file to `discarded/`. Aspects, notes, and references have no such concept; their delete is a **hard delete** (remove the file from the vault, soft-delete the DB row).

---

## Architectural Decisions

### 1. Delete semantics — hard delete, not discard

Fragments are creative work and are never truly deleted; they're moved to a `discarded/` pool. Aspects, notes, and references are reference/metadata entities — hard deletion (unlink + soft-delete DB row) is the correct semantic. No `discarded/` concept.

### 2. UUID generation — server-side, same as fragments

`POST /` handlers generate a UUID via `randomUUID()` and assemble the full domain object before calling `storageService.*.write()`. The created entity is returned in the 201 response.

### 3. `write()` is idempotent by UUID — title/key changes cause orphans

`aspects.write()`, `notes.write()`, and `references.write()` derive the file name from `key`/`title`/`name` (via `slugify`). If these fields change in a future update, the old file is not removed (same orphan issue as fragments). Not a concern for this plan — `POST /` always creates new entities with fresh UUIDs.

### 4. `delete()` flow — look up filePath, unlink, soft-delete DB

```
1. indexer.*.findByUUID(uuid) → get filePath (or throw ENTITY_NOT_FOUND)
2. vault.*.delete(filePath) → unlink the file (throws STALE_INDEX if missing)
3. vaultDatabase.transaction(() => softDeleteByFilePath(tx, filePath))
```

The inline DB update pattern mirrors what `fragments.write()` does — closes the stale-index window without waiting for the next rebuild or watcher tick.

### 5. No `DELETE /:id` for fragments — out of scope

Fragments already have `DELETE /:fragmentId` (discard). This plan is aspects/notes/references only.

---

## Changes Required

### `packages/storage/src/vault/markdown/vault.ts`

Add `delete(filePath: string)` to each of the `aspects`, `notes`, and `references` sections.

Each method:

- Resolves to absolute path via the entity's `toAbsolute*` helper
- Calls `unlink(absolutePath)` from `node:fs/promises`
- Throws `VaultError("FILE_NOT_FOUND", ...)` if the file is missing (caught upstream and rethrown as `STALE_INDEX` by the service layer, consistent with `fragments.read`)
- Logs at `debug` level on success

```ts
// example for aspects — notes and references follow the same shape
async delete(filePath: string) {
  const absolutePath = toAbsoluteAspect(filePath);
  try {
    await unlink(absolutePath);
  } catch {
    throw new VaultError("FILE_NOT_FOUND", `Aspect file not found: ${filePath}`, { filePath });
  }
  log.debug({ filePath }, "aspect deleted");
},
```

### `packages/storage/src/vault/types.ts`

Add `delete(filePath: string): Promise<void>` to the `AspectVault`, `NoteVault`, and `ReferenceVault` interfaces (or wherever vault types are declared — check if they exist or if `vault.ts` is untyped). If there are no explicit interface types for these, the change stays entirely in `vault.ts`.

### `packages/storage/src/service/storage-service.ts`

Add `delete(context, uuid)` method to `aspects`, `notes`, and `references` namespaces.

Pattern (same as `fragments.discard`):

1. Call `indexer.*.findByUUID(uuid)` — throw `ENTITY_NOT_FOUND` if missing
2. Call `vault.*.delete(indexed.filePath)` in a try/catch — rethrow `FILE_NOT_FOUND` as `STALE_INDEX`
3. Call `vaultDatabase.transaction(tx => softDelete*ByFilePath(tx, indexed.filePath))`

Import `softDeleteAspectByFilePath`, `softDeleteNoteByFilePath`, `softDeleteReferenceByFilePath` from `../indexer/upserts` (already importable — check current imports).

### `packages/api/src/schemas/aspect.ts`

Add `AspectCreateSchema`:

```ts
export const AspectCreateSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    description: z.string().optional(),
    notes: z.array(z.string()).default([]),
  })
  .openapi("AspectCreate");
```

### `packages/api/src/schemas/note.ts`

Add `NoteCreateSchema`:

```ts
export const NoteCreateSchema = z
  .object({
    title: z.string().min(1).openapi({ example: "On solitude" }),
    content: z.string().openapi({ example: "A note body..." }),
  })
  .openapi("NoteCreate");
```

### `packages/api/src/schemas/reference.ts`

Add `ReferenceCreateSchema`:

```ts
export const ReferenceCreateSchema = z
  .object({
    name: z.string().min(1).openapi({ example: "The Old Man and the Sea" }),
    content: z.string().openapi({ example: "Hemingway. Santiago. Marlin." }),
  })
  .openapi("ReferenceCreate");
```

### `packages/api/src/routes/aspects.ts`

Add two routes:

**`POST /`** — `createAspectRoute`

- Request body: `AspectCreateSchema`
- 201: `AspectSchema`
- 400: `ErrorResponseSchema`
- 500: `ErrorResponseSchema`
- Handler: `randomUUID()` → assemble `Aspect` → `storageService.aspects.write()` → return 201

**`DELETE /{aspectId}`** — `deleteAspectRoute`

- 204: no body
- 404: `ErrorResponseSchema`
- 500: `ErrorResponseSchema`
- Handler: `storageService.aspects.delete()` → return 204

### `packages/api/src/routes/notes.ts`

Same pattern:

**`POST /`** — `createNoteRoute` with `NoteCreateSchema`, 201 returns `NoteSchema`

**`DELETE /{noteId}`** — `deleteNoteRoute`, 204 on success

### `packages/api/src/routes/references.ts`

Same pattern:

**`POST /`** — `createReferenceRoute` with `ReferenceCreateSchema`, 201 returns `ReferenceSchema`

**`DELETE /{referenceId}`** — `deleteReferenceRoute`, 204 on success

### `packages/api/src/__tests__/routes/aspects.test.ts`

Add two new `describe` blocks:

```
describe("POST /projects/:projectId/aspects")
  - 201 with created entity on valid body
  - 400 when key is missing

describe("DELETE /projects/:projectId/aspects/:aspectId")
  - 204 on successful delete
  - 404 for unknown UUID
```

### `packages/api/src/__tests__/routes/notes.test.ts`

Same structure as aspects tests.

### `packages/api/src/__tests__/routes/references.test.ts`

Same structure as aspects tests.

---

## Implementation Order

1. Add `delete()` to vault layer (`vault.ts`) for aspects, notes, references
2. Add `delete()` to storage service for all three
3. Add `*CreateSchema` to API schema files
4. Add `POST /` and `DELETE /:id` routes to `aspects.ts`, `notes.ts`, `references.ts`
5. Add integration tests
6. Run `bun run test`, `bun run typecheck`, `bun run format`

---

## Out of Scope

- Update endpoints (`PUT /:id`) — not needed yet
- Bulk operations
- Aspects referencing notes by UUID vs title (current model stores note titles as strings)
