# Review: Remove Pool Concept

**Date**: 2026-04-20
**Plan**: [remove-pool-concept.md](../plans/remove-pool-concept.md)
**Status**: Issues found — see below

---

## Summary

The implementation is solid and the plan is substantially complete. The core goal — filesystem-as-truth for discarded state, `isDiscarded` replacing `pool` everywhere — is correctly achieved across all layers. There are two critical issues (migration strategy, orphaned file), two warnings (unguarded invariants, missing tests), and a few style notes.

---

## Critical Issues

### 1. Migration strategy silently broken for existing DBs

The plan specified a new `20260420_remove_pool.sql` migration with `ALTER TABLE fragments DROP COLUMN pool` and `DROP INDEX IF EXISTS fragments_pool_deleted_at_idx`. Instead, the two existing migration files (`20260405_create_vault_tables.sql`, `20260405_add_missing_indices.sql`) were edited in-place, and the journal (`_journal.json`) was not updated with a new entry.

For any existing `vault.db`, this is a no-op — `pool` won't be dropped and `is_discarded` won't be added. Valid only if the convention is "wipe DB on schema changes", but that is not documented anywhere.

**Fix**: Either add the migration file the plan specified + a new journal entry, or add a note to the storage `README.md` stating that this project uses edit-in-place migrations and requires DB deletion when the schema changes.

---

### 2. `packages/shared/src/types/domain/pool.ts` still exists

The barrel export (`export * from "./pool"` in `index.ts`) was removed, but the file itself was not deleted. The `Pool` type is still importable directly by file path.

**Fix**: Delete `packages/shared/src/types/domain/pool.ts`.

---

## Warnings

### 3. `restore()` has a title-collision bug (same as `write()`)

In `storage-service.ts`, `restore()` derives the destination path as `${slugify(indexed.title)}.md`. If another fragment already exists at that path in `fragments/`, `vault.restore()` will silently overwrite it. The `write()` method has a `// TODO:` acknowledging the identical problem. `restore()` has no guard and no comment.

**Fix**: Add a matching `// TODO:` comment in `restore()`:

```ts
// TODO: restore-collision — if a fragment already exists at the destination slug,
// rename will overwrite it silently. Guard with an existence check or unique slug.
```

---

### 4. `restore()` doesn't guard against being called on a non-discarded fragment

If called on a fragment that is not discarded, source and destination paths would be identical (same slug), resulting in a filesystem no-op with no error or useful signal.

**Fix**: Add an early guard:

```ts
if (!indexed.isDiscarded) {
  throw new StorageError("FRAGMENT_NOT_DISCARDED", ...);
}
```

---

### 5. `restore()` has no integration tests

`discard()` is covered in `storage-service.test.ts`. `restore()` is new, non-trivial (inline DB upsert + file rename), and has no test. The plan's section 13 omitted this.

**Fix**: Add a test asserting: file moves back to `fragments/`, index reflects `isDiscarded: false`, original discarded path is no longer present.

---

### 6. `parse.test.ts` / `serialize.test.ts` still use `pool` in fixtures

These files test the schema-agnostic parser/serializer, so `pool` as a generic frontmatter key is technically valid. But the assertions read as if `pool` is an expected domain concept, which is misleading after removal.

**Fix**: Either replace `pool` with a neutral key (e.g. `customField`) or add a comment clarifying these test arbitrary frontmatter pass-through, not the fragment domain model.

---

## Style

- **Duplicate import in `fragment-editor.tsx`**: `useRestoreFragment` is imported in a second `import` statement from the same module as the other hooks. Merge into the existing import block.

- **Stale comment in `storage-service.test.ts`** (~line 96): `"Rebuild required — discard does not update the index"` is no longer true now that `discard()` does an inline DB upsert. The `service.index.rebuild(context)` call after discard is redundant and should be removed along with the comment.

- **Redundant `isDiscarded` assertion** in `mappers/fragment.test.ts`: the `isDiscarded=false for active files` test case duplicates the assertion already present in the `"maps all frontmatter fields"` test.

---

## Architecture Note

`isDiscarded` is re-derived from the file path in both `fromFile` (mapper) and `upsertFragment` (upserts.ts). The double-derivation is intentionally safer — no caller can pass a wrong value to the DB — but a comment in `upsertFragment` explaining the deliberate re-derivation would prevent future confusion.

---

## Open Questions

1. Is the convention "wipe `vault.db` on schema changes"? If so, document it in the storage README.
2. Should `restore()` guard against being called on a non-discarded fragment explicitly?
3. Should `restore()` tests be added before the plan status is marked Done?
