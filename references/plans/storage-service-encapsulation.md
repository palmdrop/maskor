# Storage Service Encapsulation

**Date**: 05-04-2026
**Status**: Done
**Implemented At**: 05-04-2026

---

## Goal

Consumers of `StorageService` (the future `@maskor/api`, tests) should never deal with file paths or raw vault/indexer handles. All operations are UUID-based. File path routing is an internal implementation detail.

No new abstraction layers. The service keeps its current shape — `context` is passed per call, resolved once at the handler level.

---

## Change 1 — Vault: relative paths + root guard

**Problem:** `vault.fragments.read(filePath)` accepts any absolute string. No validation that the path is inside the vault. Paths are verbose and leak the vault root.

**Change:**

- All path parameters on the `Vault` interface become **relative to vault root** (e.g. `fragments/my-fragment.md`).
- Internal helper `resolvePath(relativePath: string): string`:
  - `join(root, relativePath)` then `path.resolve()`.
  - Validates result starts with `path.resolve(root)` — prevents `../` traversal.
  - Throws `VaultError("PATH_OUT_OF_BOUNDS", ...)` on failure.
- `readAllWithFilePaths()` strips `config.root` prefix before returning.
- `write` and `discard` already compute paths internally — no interface change needed there.
- Add `"PATH_OUT_OF_BOUNDS"` to `VaultErrorCode`.

**Interface impact:** `Vault` stays structurally the same. `WithFilePath<T>.filePath` is now relative.

---

## Change 2 — Indexer: relative paths flow through automatically

No structural change needed. `rebuild()` reads `filePath` straight from vault's `readAllWithFilePaths()` entries and writes to DB — after Change 1, those are relative. `IndexedFragment.filePath` etc. become relative strings.

`findFilePath(uuid)` returns a relative path, which `vault.discard(relativePath)` accepts directly.

---

## Change 3 — Indexer: add missing UUID lookups

`service.aspects.read(context, uuid)`, `service.notes.read(context, uuid)`, and `service.references.read(context, uuid)` need UUID → filePath resolution. Currently only `findByKey` and `findByTitle` exist for those types. Add:

```ts
aspects: {
  findByUUID(uuid: AspectUUID): Promise<IndexedAspect | null>
}
notes: {
  findByUUID(uuid: NoteUUID): Promise<IndexedNote | null>
}
references: {
  findByUUID(uuid: ReferenceUUID): Promise<IndexedReference | null>
}
```

Single-row DB selects — small additions to `indexer.ts` and the `VaultIndexer` interface.

---

## Change 4 — StorageService: UUID-based API, hide internals

**Remove from public type:** `getVault`, `getVaultDatabase`, `getVaultIndexer`. Keep as private helpers inside the factory closure.

**Add namespaced, UUID-based methods:**

```ts
const context = await service.resolveProject(projectUUID); // once per handler

await service.fragments.read(context, uuid); // indexer.findFilePath → vault.read
await service.fragments.readAll(context); // indexer.fragments.findAll
await service.fragments.findByPool(context, pool); // indexer.fragments.findByPool
await service.fragments.write(context, fragment); // vault.write (slug-based path, internal)
await service.fragments.discard(context, uuid); // indexer.findFilePath → vault.discard (already exists)
await service.aspects.read(context, uuid); // indexer.aspects.findByUUID → vault.read
await service.aspects.readAll(context); // indexer.aspects.findAll
await service.aspects.write(context, aspect); // vault.write
await service.notes.readAll(context); // indexer.notes.findAll
await service.notes.write(context, note); // vault.write
await service.references.readAll(context); // indexer.references.findAll
await service.references.write(context, reference); // vault.write
await service.pieces.consumeAll(context); // vault.pieces.consumeAll
await service.index.rebuild(context); // indexer.rebuild
```

Registry methods stay flat (no namespace — they don't take a context):

```ts
await service.registerProject(name, vaultPath);
await service.listProjects();
await service.removeProject(uuid);
await service.resolveProject(uuid);
```

**Known limitation to document:**

- `fragments.write` derives the file path from the slug. A renamed fragment creates a new file at the new slug; the old file stays until next rebuild. Add a `// TODO:` comment.

---

## Files changed

| File                                | Change                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `vault/types.ts`                    | Add `PATH_OUT_OF_BOUNDS` to `VaultErrorCode`                                                         |
| `vault/markdown/vault.ts`           | Add `resolvePath` guard; switch path params/returns to relative                                      |
| `indexer/types.ts`                  | Add `findByUUID` to aspects, notes, references; note `filePath` is now relative                      |
| `indexer/indexer.ts`                | Implement `findByUUID` for aspects, notes, references                                                |
| `service/storage-service.ts`        | Add namespaced UUID methods; remove `getVault`/`getVaultDatabase`/`getVaultIndexer` from public type |
| `__tests__/vault.test.ts`           | Update to relative paths                                                                             |
| `__tests__/storage-service.test.ts` | Update to use namespaced methods                                                                     |

---

## Out of scope

- Chunked `rebuild()` (memory concern — separate TODO).
- DB indexes on hot columns (`pool`, `deleted_at`) — separate TODO.
- File watcher integration.
- Full content reads for notes/references (no body in index) — add later if needed.
