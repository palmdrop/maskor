# Review: Filename as key source of truth

**Date**: 2026-05-04
**Scope**: `packages/storage/src/service/storage-service.ts`, `packages/storage/src/watcher/watcher.ts`, `packages/storage/src/vault/markdown/mappers/`
**Plan**: `references/plans/filename-as-key-source-of-truth.md`

---

## Overall

The refactor correctly extracts three identical inline cascade blocks into shared helpers and wires rename detection into the watcher. The mapper changes are clean and tests cover the key paths well. One correctness regression: the original code committed the primary entity and all cascade writes in a single SQLite transaction; the refactored path splits them across multiple transactions, opening a consistency window.

---

## Bugs

### 1. Cascade and primary-entity upsert are no longer atomic

`storage-service.ts:822–836` (notes.update), `:695–715` (aspects.update), `:980–995` (references.update)

Before this commit, `notes.update` committed `upsertNote + all cascaded fragment upserts + all cascaded aspect upserts` in a single SQLite transaction. After the refactor the sequence is:

```
cascadeFragments  → transaction A  (fragment rows now reference newKey)
cascadeAspects    → transaction B  (aspect rows now reference newKey)
upsertNote        → transaction C  (note row still has oldKey until here)
```

If a read races between A/B and C, it sees fragments/aspects referencing `newKey` while the note row still returns `oldKey`. If the process dies between B and C (or transaction C fails for any reason), the DB is left in this split state until the watcher re-syncs the note file.

The inconsistency is self-healing (watcher will re-detect and re-upsert the note), but concurrent reads will observe it, and any code that joins on the note key between B and C returns wrong results.

Fix: run the primary-entity upsert inside the same transaction as the cascade writes. The cascade helpers would need to accept a transaction parameter, or `notes.update` / etc. would need to be restructured to collect the cascade payload and commit everything together.

---

## Minor

### 2. Missing braces on single-line `if`

`storage-service.ts` — `cascadeAspectKeyRename` inner lambda:

```ts
if (oldProperty !== undefined) updatedProperties[newKey] = oldProperty;
```

Coding standard requires explicit braces on all `if` bodies.

### 3. Abbreviated arrow-function parameter

`storage-service.ts` — `cascadeAspectKeyRename`:

```ts
(f) => {
  const oldProperty = f.properties[oldKey];
```

`f` should be `fragment` per the no-abbreviation rule. `cascadeAspects` in `cascadeNoteKeyRename` uses `(a) => ...` for the same reason — should be `(aspect) => ...`.

---

## Non-issues

- **Hash guard prevents double-processing of cascade writes** — `cascadeFragments` / `cascadeAspects` read the new raw content after writing and store it in the DB. When the watcher re-fires for those files, the hash matches the stored value and the sync is skipped. Correct.
- **`touched` includes all UUIDs (found and not found)** — matches the pre-refactor `warningFragments` behavior exactly; not a semantic change.
- **`cascadeCallbacks` optional in watcher** — when absent, rename detection is skipped but `upsertNote` / `upsertReference` still runs and updates the key from the filename. The aspect hash-guard bypass (`!isRename`) still works because `storedRow` is queried unconditionally for aspects (needed for the hash comparison).
- **Watcher rename detection fires before `upsertNote`** — the note file is not modified by `cascadeNoteKeyRename`, so `noteMapper.fromFile` reads the correct unmodified content. The note's new key is derived from the filename stem, which is already correct at this point.
