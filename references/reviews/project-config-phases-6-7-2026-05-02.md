# Review: Project Config — Phases 6, 6b, 7 and key-schema unification

**Date**: 2026-05-02
**Scope**: `packages/storage`, `packages/api`, `packages/shared`, `packages/frontend`
**Plan**: `references/plans/project-config-page.md`

---

## Overall

The backend for Phase 6 (aspect key rename + cascade), Phase 6b (note/reference rename cascade), and Phase 7 (editor config) is solid and well-structured. The key-schema unification (Phase 5b) is clean throughout. The main structural problem is an incomplete migration to hard-delete: notes and references are now hard-deleted in all paths, but aspects and fragments are still soft-deleted in the watcher and rebuild sweep — inconsistent with the storage service, which hard-deletes both.

---

## Bugs

### 1. Aspects and fragments are still soft-deleted in two paths

**Watcher** — `packages/storage/src/watcher/watcher.ts:411,417` uses `softDeleteFragmentByFilePath` and `softDeleteAspectByFilePath` on file deletion. Notes and references at lines 423/429 correctly use hard-delete. The watcher is inconsistent within itself.

**Rebuild sweep** — `packages/storage/src/indexer/indexer.ts:60–70,108–122` does `UPDATE ... SET deletedAt` for absent aspects and fragments instead of `DELETE`. Notes and references at lines 80–96 correctly use `tx.delete(...)`.

The storage service (`storage-service.ts`) hard-deletes all four entity types. So:

| Entity    | Rebuild sweep | Watcher delete | Service delete |
|-----------|--------------|----------------|----------------|
| Notes     | hard ✓       | hard ✓         | hard ✓         |
| References| hard ✓       | hard ✓         | hard ✓         |
| Aspects   | **soft ✗**   | **soft ✗**     | hard ✓         |
| Fragments | **soft ✗**   | **soft ✗**     | hard ✓         |

Consequence: aspect and fragment rows accumulate stale `deletedAt` entries from watcher/rebuild paths. The `isNull(deletedAt)` guards in `findAll()` / `findByUUID()` keep queries correct for now, but the soft-delete machinery for aspects/fragments is now partially vestigial and the inconsistency will cause confusion.

Fix: replace the soft-delete UPDATE blocks in the rebuild sweep with `tx.delete(...)`, and replace `softDeleteFragmentByFilePath` / `softDeleteAspectByFilePath` calls in the watcher with `deleteFragmentByFilePath` / `deleteAspectByFilePath`. After this change, `softDeleteFragmentByFilePath` and `softDeleteAspectByFilePath` in `upserts.ts` become dead code and should be removed. The `deletedAt` columns and their indexes on `aspectsTable` and `fragmentsTable` can then be dropped in a migration, along with all `isNull(deletedAt)` guards.

---

## Design

### 2. `notes.findAll()` and `references.findAll()` don't filter `deletedAt`

`packages/storage/src/indexer/indexer.ts:274,302` — Both return `.all()` with no `isNull(deletedAt)` filter. `aspects.findAll()` and `fragments.findAll()` guard with `isNull(deletedAt)`. Notes and references are now always hard-deleted, so the `deletedAt` column exists in the schema but will never be set. If any rows from before the hard-delete migration still have `deletedAt != null`, the KEY_CONFLICT check in `notes.write` / `references.write` would incorrectly count them as live entries and block key reuse.

Cleanest fix: drop `deletedAt` from `notesTable` / `referencesTable` entirely (consistent with hard-delete for notes/references), then remove the column references and their indexes.

---

## Minor

### 3. Commented-out `softDelete*` calls left in `storage-service.ts`

`packages/storage/src/service/storage-service.ts:336,405,505` — Three commented-out lines remain:

```ts
//softDeleteFragmentByFilePath(tx, sourceEntityRelativePath);
// softDeleteFragmentByFilePath(tx, sourceEntityRelativePath);
// softDeleteAspectByFilePath(tx, indexed.filePath);
```

Remove them.

### 4. Dead `softDeleteNoteByFilePath` / `softDeleteReferenceByFilePath` in `upserts.ts`

`packages/storage/src/indexer/upserts.ts:216,224` — Exported but have no callers. Remove.

---

## Non-issues

- **Aspect key rename UI** — `AspectKeyInput` in `AspectsTab.tsx` handles inline rename with cascade banner via `handleRenamed`. Correctly uses the `PATCH /aspects/:id` route and surfaces `result.data.warnings`. Plan items are correctly checked off.
- **`validateEntityKey` whitelist** — `/^[a-zA-Z0-9 _-]+$/` is stricter than the plan spec (`::` only), but intentional. Error message is explicit.
- **`validateEntityKey` called outside the main try-catch in route handlers** — intentional; allows key validation to return 400 before entering the `throwStorageError` path.
- **Manifest written before DB update in `registry.updateProject`** — consistent with the established "manifest-first" design documented in the `registerProject` comment; fallback `updatedRow ?? row` preserves safe return on DB failure.
- **`warningFragments` / `warningAspects` include all cascaded UUIDs, not just failures** — matches the plan spec ("warnings lists the affected fragment UUIDs").
