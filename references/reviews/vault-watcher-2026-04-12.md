# Review: Vault Watcher Implementation

**Date**: 2026-04-12
**Files reviewed:**

- `packages/storage/src/watcher/watcher.ts`
- `packages/storage/src/indexer/upserts.ts`
- `packages/storage/src/service/storage-service.ts`
- `packages/api/src/middleware/resolve-project.ts`
- `packages/storage/src/vault/types.ts`
- `packages/storage/src/vault/markdown/vault.ts`
- `packages/storage/src/indexer/indexer.ts`

---

## Summary

The implementation is largely correct and follows the plan. The race condition mitigation (pause/resume around rebuild) works and the hash guard is sound. However, there are several real bugs or near-bugs: the `isPaused` log-before-guard ordering fires a log line even when paused; the soft-delete helpers don't filter `deletedAt IS NULL` so they re-stamp an already-deleted row; `loadAspectKeyToUuid` in the watcher does not filter soft-deleted aspects; the `syncPieces` for-of loop inserts each fragment in its own transaction rather than one batch; and there is meaningful code duplication that the in-code TODOs acknowledge but should be flagged as actionable. Coding standard violations are limited but present.

---

## Issues

### `watcher.ts`

- **[WARNING] Log fires before the `isPaused` guard in `handleAddOrChange` (line 350–351)**
  `log.info({ filePath: absolutePath }, "watcher: add or change")` is called before `if (isPaused) return`. Every chokidar event during a rebuild will emit an info log even though it is immediately discarded. This is noise that will make logs misleading during a rebuild. The guard and the log should be swapped, or the log should be moved to after the guard.

- **[CRITICAL] `loadAspectKeyToUuid` in `watcher.ts` does not filter soft-deleted aspects (line 40–49)**
  The watcher's copy queries `aspectsTable` without a `WHERE deletedAt IS NULL` clause. The `StorageService` version at line 95–105 correctly adds `.where(isNull(aspectsTable.deletedAt))`. During a fragment sync that follows an aspect deletion, the watcher resolves aspect keys against stale/deleted rows — a fragment can end up with an `aspectUuid` pointing at a soft-deleted aspect. Fix: add `isNull(aspectsTable.deletedAt)` to the watcher's `loadAspectKeyToUuid`, or consolidate both copies into a single shared helper.

- **[WARNING] `loadAspectKeyToUuid` is duplicated between `watcher.ts` and `storage-service.ts`**
  Two implementations of the same query, one of which is already wrong (see above). Extract a shared helper into `indexer/upserts.ts` or a new `indexer/utils.ts` and import it in both places. The divergence is the direct cause of the bug above.

- **[WARNING] `syncPieces` runs each fragment upsert in its own transaction (line 333–335)**
  The `for` loop calls `vaultDatabase.transaction()` per fragment. If there are N pieces this is N separate transactions — each one a separate fsync. The comment at line 316 notes this is a potential issue. The correct fix is to batch all upserts inside a single transaction around the entire loop.

- **[WARNING] `syncPieces` re-reads the file after `consumeAll` already deleted it (lines 319–329)**
  `vault.pieces.consumeAll()` returns `Fragment[]` which are already parsed. The code then constructs an `absoluteFragmentPath` under `fragments/` — not `pieces/` — implying the intent is to hash the written-out fragment, not the original piece. This path derivation (`slugify(fragment.title) + ".md"`) mirrors the write path in `fragments.write()`, so it should be correct. However: if `vault.fragments.write()` hasn't been called yet by `consumeAll` (depending on its implementation), this read will fail. Check that `consumeAll()` in `vault.ts` actually writes to `fragments/` before returning — it calls `initFragment` and returns fragments but there is no `fragments.write()` call visible in `consumeAll`. **If `consumeAll` does not write to `fragments/`, the re-read in `syncPieces` will always throw ENOENT and every piece will be silently skipped.** This needs verification.

- **[STYLE] `rawContent` assignment in `syncAspect` is dead after write-back (line 209)**
  The `// TODO:` at line 209 correctly identifies this. `rawContent` is reassigned to `rewritten` but never read again (aspects have no `contentHash`). The variable should be removed after the write and `rewritten` used only for `Bun.write`. Minor but the dead assignment is confusing.

- **[STYLE] Logging in `handleAddOrChange` uses `absolutePath` directly in `log.info` (line 350)**
  The handler logs the absolute path, while all subsequent sync functions log the entity-relative path. Inconsistent context across log lines for the same event makes correlation harder. Either log the relative path or log both.

- **[STYLE] `for...of` to accumulate into an object / array (upserts.ts lines 50, 147, 154, 162)**
  The `for...of` loops in `upsertAspect` and `upsertFragment` insert rows one at a time but are inserting into a DB, not accumulating into a plain object, so the `reduce` standard technically doesn't apply here. However `indexer.ts` also uses `for...of` extensively in places where `reduce` would be idiomatic for the `aspectKeyToUuid` map (lines 46–48) — that one does qualify and should be `reduce`.

---

### `upserts.ts`

- **[WARNING] `softDeleteByFilePath` helpers do not guard against already-deleted rows**
  `softDeleteFragmentByFilePath` (and all equivalents) run `UPDATE ... SET deletedAt = new Date() WHERE filePath = ?` with no `AND deletedAt IS NULL`. This re-stamps the `deletedAt` timestamp on an already soft-deleted row every time it is called. This is harmless today (row stays logically deleted) but it silently changes the `deletedAt` timestamp, which could matter if anything uses that timestamp for "deleted since" queries in the future. Add `and(eq(...filePath...), isNull(...deletedAt...))` for correctness.

- **[WARNING] `for...of` inserting notes/references per-fragment without bulk insert**
  `upsertFragment` deletes and re-inserts `fragmentNotesTable`, `fragmentReferencesTable`, and `fragmentPropertiesTable` row-by-row inside the caller's transaction. This is intentional since SQLite batch insert isn't trivially supported in Drizzle, but it is worth a `// TODO:` noting that Drizzle's `insert().values([...array])` does support bulk inserts and this could be a single statement.

- **[STYLE] `for...of` when accumulating warnings (line 162–175)**
  The `for...of` over `Object.entries(fragment.properties)` is accumulating into `warnings` — this qualifies for `reduce` per the coding standard. The current structure is readable but violates the standard.

---

### `storage-service.ts`

- **[WARNING] `fragments.write()` title-change orphan has no `// TODO:` with a reason**
  The comment at line 192–193 describes the orphan problem correctly but the format is a plain comment, not `// TODO:`. Per the coding standard, known limitations need `// TODO:` with a reason so they are searchable. Change to `// TODO: old file becomes orphaned until next rebuild — vault.fragments.write() should return the old filePath so it can be soft-deleted here.`

- **[WARNING] `fragments.discard()` double-reads the file (lines 247, 253–255)**
  After `vault.fragments.discard()`, the service:
  1. Reads the raw content from the destination path (`Bun.file(absoluteDestination).text()`)
  2. Then reads the `Fragment` object via `vault.fragments.read(destinationEntityRelativePath)`

  `vault.fragments.read()` internally calls `readMarkdown` (another file read) and then `parseFile`. That is two file reads for the same file in sequence. The `Fragment` could be obtained by parsing the already-read `rawContent` directly (same as what the watcher does), avoiding the extra read.

- **[WARNING] `storageService.watcher.start()` is called on every request in `resolveProject`**
  `start()` is documented as idempotent so this is safe. However, it means a watcher starts the moment _any_ project route is first hit, with no rebuild guarantee. The comment acknowledges this. The real issue is ordering: if the first request hits before a rebuild, watcher events can reflect a partially-indexed vault. This is an accepted design tradeoff per the plan's note, but the `// TODO:` marker is absent. The comment says "the watcher will still catch changes" but does not note that reads during the catch-up window may return stale data (`FRAGMENT_NOT_FOUND`). Add a `// TODO:` here.

---

### `indexer.ts`

- **[STYLE] `for...of` when building `aspectKeyToUuid` map (lines 46–48)**

  ```ts
  for (const { entity: aspect } of aspectEntries) {
    aspectKeyToUuid.set(aspect.key, aspect.uuid);
  }
  ```

  This is accumulating into a `Map` — the coding standard's `reduce` preference applies. Use `reduce` here for consistency.

- **[STYLE] `for...of` building `unresolvedKeys` (lines 52–60)**
  Same as above — this is accumulating into a `Map` and should be `reduce`.

- **[WARNING] Warning deduplication between `fragmentWarnings` and `unresolvedKeys` is redundant**
  `upsertFragment` already returns per-fragment warnings for unknown aspect keys. The `unresolvedKeys` map is built in Phase 1, then merged in the post-transaction block (lines 160–170) with a duplicate check. Since `fragmentWarnings` already contains exactly these warnings (returned from `upsertFragment`), the `unresolvedKeys` merge is dead code that produces no additional warnings. It also complicates the logic. Either remove the `unresolvedKeys` pre-collection entirely, or remove the post-transaction merge and rely solely on `fragmentWarnings`.

---

### `vault/markdown/vault.ts`

- **[STYLE] `listMarkdownFiles` uses `for await...of` to push into an array**
  The loop at lines 75–77 pushes into `entries`. This is an async accumulation pattern, not a simple map, so `reduce` doesn't cleanly apply here. No violation.

- **[WARNING] `consumeAll` does not write fragments to `fragments/` — `syncPieces` will always fail**
  Looking at `consumeAll` (lines 302–338 in vault.ts): it reads piece files, calls `initFragment`, pushes to `results`, deletes the piece file, and returns. It never calls `vault.fragments.write()`. In `watcher.ts`'s `syncPieces` (lines 319–329), after `consumeAll` returns, the code tries to read from `vaultRoot/fragments/entityRelativePath`. That file does not exist because `consumeAll` never wrote it there. **This means `syncPieces` will always hit the ENOENT catch, log a warning, and skip the upsert for every piece.** The pieces are consumed (deleted from `pieces/`) but never indexed. This is a correctness bug.

---

## Architecture Notes

**The `pause/resume` approach is correct but narrow.** It guards the watcher-vs-rebuild race by dropping events during rebuild. Events arriving _during_ rebuild are silently discarded rather than queued. If an external edit lands exactly in the rebuild window, the change will not be picked up until the next rebuild or a new watcher event. For a single-user local app this is acceptable, but it is worth a `// TODO:` noting the drop-not-queue behavior.

**`loadAspectKeyToUuid` living in both `watcher.ts` and `storage-service.ts` is an abstraction hole.** The plan says "Load `aspectKeyToUuid` from DB at sync time" but doesn't specify where the helper lives. Both places re-implemented it independently and one got it wrong. This should be a single exported helper in `indexer/upserts.ts` or a dedicated `indexer/queries.ts`.

**Chokidar event ordering note in the plan (Section 4) is not enforced in code.** The plan says "process `aspects/` events before `fragments/` events when both are pending." Chokidar fires events serially on a single listener, so in practice this is only an issue if an aspect and fragment are written fast enough to both land in the same `awaitWriteFinish` window. Since the plan documents this as a hazard and not a code change, it's fine — but `handleAddOrChange` processes fragment events before aspect events by prefix-chain order (fragments check comes first). Swap to check aspects first so the code aligns with the documented intent.

**`syncPieces` consuming all pieces on any single piece add is a semantic issue.** The design acknowledges this explicitly. The real problem is that `consumeAll` returning `Fragment[]` (already parsed) while `syncPieces` then tries to re-read the written fragment file is double-handling. The simpler design is for `consumeAll` to return `WithFilePath<Fragment>` (already including `rawContent`), which removes the re-read entirely and fixes the ENOENT bug.

---

## Questions

1. Does `vault.pieces.consumeAll()` write the consumed fragments to `fragments/` before returning? Based on reading `vault.ts`, it does not. If that's intentional, then `syncPieces`'s file re-read will always fail — the `rawContent` for hashing must come from a different source.

2. Is the `VaultWatcher.pause()`/`resume()` API intentionally public on `StorageService`? Currently it is not exposed there — only `start()` and `stop()` are. The `rebuild()` wrapper calls `watcher.pause()` internally. Is there any consumer that should be able to pause the watcher directly?

3. `softDeleteFragmentByFilePath` uses `eq(filePath)` with no `deletedAt IS NULL` guard. Is there a scenario where two rows can share the same `filePath` (e.g., a fragment deleted and re-added at the same path)? If so, re-stamping the old row's `deletedAt` is the correct behavior. If not, the guard is cheap insurance.
