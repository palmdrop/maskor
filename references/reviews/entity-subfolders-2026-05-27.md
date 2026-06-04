# Review: Entity subfolders (categories) and UUID-anchored identity

**Date**: 2026-05-27
**Scope**: `packages/storage`, `packages/api`, `packages/shared`, `packages/frontend`
**Plan**: `references/plans/entity-subfolders.md`
**Spec**: `specifications/storage-sync.md`, `specifications/aspect-arc-model.md`, `specifications/attachments.md`, `specifications/project-management.md`
**ADR**: `references/adr/0002-uuid-revival-on-return.md`

---

## Overall

The implementation matches the plan's intent: category is derived from `filePath`, fragments stay root-only, folder-only moves don't cascade, and UUID-anchored identity survives external out-and-back returns. The ADR-0002 divergence (hard-delete + in-memory tracker instead of soft-delete) is well documented and the in-window/out-of-window/cross-type test cases all exercise the happy path. The watcher's three-case classification (hash+path match, hash match + path differ, hash differ) and the `oldKey !== filenameKey` gate on cascade are exactly what the plan asked for.

Two findings worth attention: a frontend test-coverage regression where ~3 non-category live-metadata-save tests were deleted but not migrated, and a small race window during cross-entity-type moves where both source and destination rows can transiently coexist. Neither blocks merging, but both deserve a follow-up.

---

## Bugs

None.

---

## Design

### 1. Frontend test coverage regression on `AspectEditor`

`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.test.tsx` (257 lines, deleted in Phase 1) covered four behaviors:

1. `editing category: input updates immediately, PATCH fires after debounce` — migrated to the new `AspectEditor.category.test.tsx`.
2. `isPending stays false during a live metadata save (separate mutation instance)` — **dropped, not migrated.**
3. `on success: cache adopts the server response (no single-aspect refetch)` — **dropped, not migrated.**
4. `on error: rolls back optimistic write and surfaces the error inline` — **dropped, not migrated.**

The new `AspectEditor.category.test.tsx` (223 lines) is category-focused: rendering, autocomplete, client-side validation, debounce, invalid-input no-PATCH. It does not exercise the dual-mutation-instance pattern that `AspectEditor.tsx:40-41` uses, nor the optimistic-write / rollback paths in `makeSave` (`AspectEditor.tsx:61-107`).

Those three tests were load-bearing — they protected against subtle regressions like the content Save button silently locking up during a live metadata save, or the editor showing stale content after a failed PATCH. The behaviors they covered are still in `NoteEditor.tsx` and `ReferenceEditor.tsx` too, and currently have no equivalent test coverage anywhere.

Fix: port the three deleted tests into either `AspectEditor.category.test.tsx` (rename it) or a sibling test file. The mocking infrastructure they need is identical to what the new file already sets up.

### 2. Cross-entity-type return: transient dual-row window

`packages/storage/src/watcher/sync/keyed-entity.ts` and `packages/storage/src/watcher/watcher.ts:71-73` (separate `RecentlyDeletedTracker` per entity-type, separate `RenameBuffer` per entity-type).

Scenario: a user moves `aspects/x.md` → `notes/x.md` quickly (within the 500ms rename-buffer window).

```
t=0   aspects/x.md unlink → aspectRenameBuffer.add(UUID, key, path, onExpire)
t=50  notes/x.md   add    → noteRenameBuffer.check(UUID, key) → null
                          → queryStoredRow(UUID) in notesTable → null
                          → upsert into notesTable with UUID U
                          → noteRecentlyDeleted.consume(UUID) → false
                          → emit note:synced (no revived flag) ✓
t=500 aspectRenameBuffer expiry fires → hard-delete aspectsTable row for UUID U
                          → aspectRecentlyDeleted.record(UUID)
```

Between t=50 and t=500 (up to ~450ms), `aspectsTable` and `notesTable` both contain a row with UUID U. Any consumer reading both tables in that window sees two entities with the same UUID. The spec and ADR-0002 don't promise atomicity here — they document the eventual state — but a follow-on rebuild during the window would be confusing.

Probably acceptable as-is given the windows are short and the operation is user-initiated, but worth a one-line comment in `keyed-entity.ts` acknowledging the window, so future readers don't expect cross-table UUID uniqueness as an invariant.

### 3. Empty subfolders not pruned after category moves

`packages/storage/src/service/storage-service.ts:988-1000` (and the equivalent blocks for notes at 1119-1131 and references at 1293-1305) unlink the old file when category changes, but never check whether the now-empty parent directory should be removed.

Scenario: aspect "grief" is in `aspects/theme/grief.md` and is the only file in `theme/`. User patches it to `category: null`. New file at `aspects/grief.md` is written, `theme/grief.md` is unlinked, and `theme/` remains as an empty directory in the vault.

Not a correctness bug — the rebuild's recursive scan handles empty dirs fine — but vault aesthetics degrade over time, and a user looking at the folder in Obsidian sees ghost categories with nothing in them. The plan didn't call this out as a deferral.

Fix is small: after `unlink`, try `rmdir(dirname(absoluteOldPath))` and swallow `ENOTEMPTY`. Apply at the three update-with-category sites in `storage-service.ts`.

---

## Minor

### 4. `CategoryField` autocomplete is not sorted

`packages/frontend/src/components/category-field.tsx:58-62` filters `existingCategories` by prefix-match but preserves source ordering. `groupByCategory` (`packages/frontend/src/utils/group-by-category.ts:16-19`) sorts categories alphabetically. Two surfaces, two orderings. Minor UX inconsistency.

### 5. Note/reference indexer queries skip the assembler pattern

`packages/storage/src/indexer/indexer.ts:345-429` — `notes.findAll`, `notes.findByKey`, `notes.findByUUID`, and the references equivalents map rows inline. `aspects.findAll` etc. use `assembleAspect` from `assemblers.ts`. The aspect helper exists to derive `category` from `filePath`; the same logic is duplicated four times in the notes/refs blocks. Pull out `assembleNote` / `assembleReference` for symmetry. Cosmetic, low priority.

### 6. `RecentlyDeletedTracker.consume()` does not proactively evict

`packages/storage/src/watcher/utils/recently-deleted.ts:47-53`. `consume` deletes the matched entry (good — that's the take-and-clear semantics the comment describes), but it doesn't sweep other expired entries. Eviction only fires inside `record()` and `size()`. Practically harmless given the 24h TTL and the 1024-entry cap, but if you ever lower the TTL for testing, expired entries can sit there longer than expected.

### 7. Frontend duplicates `validateCategoryPath` regex

`packages/frontend/src/components/category-field.tsx:8-33` re-implements `validateCategoryPath` because importing from `@maskor/shared` would pull in the pino logger and crash in the browser. This is documented in code and tracked in `references/suggestions.md` as a known issue with the shared-package barrel. Not a new problem introduced here, just inheriting it.

### 8. `discardedFiles` ordering inside `vault.fragments.readAll`

`packages/storage/src/vault/markdown/vault.ts:153-158` — the non-recursive top-level glob plus a separate scan of `fragments/discarded/` was preserved from before. Worth noting that the new recursive `**/*.md` scan for aspects/notes/refs intentionally diverged from the fragment pattern. The asymmetry is correct (plan §5) but reading the file you have to look twice to see the intent.

---

## Non-issues

- **Two `useUpdateAspect()` mutation instances in `AspectEditor.tsx:40-41`** — intentional, prevents live-metadata-save `isPending` from disabling the content Save button. The deleted test #2 had asserted this behavior; the pattern remains.
- **`upsertNote` / `upsertReference` no longer accept a `category` parameter** — derived from `filePath` at read time via `deriveCategory`. Correct given the plan's "no DB column" rule.
- **Migration drops `aspects.category` without a transition** — greenfield project, no live users; matches CLAUDE.md's stance on backwards-compat.
- **Cross-entity-type return does not set `revived: true`** — explicitly intentional per ADR-0002 (the recently-deleted tracker is per entity-type). The watcher test "cross-entity-type return" asserts this.
- **`fragments/discarded/` is the only valid nested folder under `fragments/`** — enforced in `packages/storage/src/watcher/sync/fragment.ts:29-38` with a `log.warn` + skip. Tested in `watcher.test.ts:694-725`.
- **`syncFragment` normalizes `\\` to `/`** while `keyed-entity.ts` doesn't — fragments need the normalization because they receive raw paths in the rejection check; keyed entities go through `listMarkdownFiles` which already normalizes (`vault.ts:99-100`). Different paths, same end state.
- **`upsertAspect` pre-delete strips colliding rows by `key` or `filePath`** — required because both columns are `UNIQUE` but `onConflictDoUpdate` only handles the primary-key conflict target. Tested in `indexer.test.ts:401-422`.
- **Action log emits both `aspect:renamed` and `aspect:category-changed` for a simultaneous key+category patch** — two distinct intents, two distinct log entries; preserves the single-intent design from the action-log spec.
- **Aspect `category` schema is `string | undefined` (domain) but the API PATCH accepts `string | null`** — `null` is the explicit "clear" sentinel; `undefined` means "leave unchanged". The translation happens in the route handler (`routes/aspects.ts:485-491`).
- **`vault.aspects.write` does not delete the old file at the old category** — by design. The storage-service `aspects.update` orchestrates the move (write new + unlink old). `vault.aspects.write` is just a write primitive.
- **`upsertAspect` strips the `notes` join table and re-inserts every aspect** — same pattern as before; idempotent and correct.
