# Review: External Rename Cascade

**Date**: 2026-05-07
**Scope**: `packages/storage/src/watcher/`
**Plan**: `references/plans/external-rename-cascade.md`

---

## Overall

Core mechanic is correct — the `RenameBuffer` abstraction is clean and the unlink/add correlation works as designed. Two plan tasks are incomplete: the pause/resume interaction is unaddressed (potential spurious deletion during rebuild), and the `stop()`-during-pending test is missing. One structural asymmetry in `syncAspect` creates confusing control flow but isn't broken. The upserts are correctly keyed by UUID (Phase 1 satisfied), but a secondary UNIQUE constraint on `key` and `filePath` means the upsert is not self-sufficient — correctness depends entirely on collision detection always running first.

---

## Bugs

### 1. Pause during rename window causes spurious deletion

`watcher.ts` — If `pause()` is called between the `unlink` and the matching `add` (e.g. during a rebuild), the `add` event is dropped by the `isPaused` guard. The 500ms timer then fires and commits the deletion. The entity is deleted instead of renamed.

```
unlink → buffer entry created → pause() → add dropped → timer fires → delete committed
```

The plan explicitly listed "Verify pause/resume does not leave stale entries in the buffer" as a Phase 3 task. It's entirely unaddressed. A rebuild happening in the middle of an external rename will silently destroy the entity.

Fix: on `pause()`, call `drainAll()` on all three buffers so in-flight pending entries are committed before the rebuild transaction begins (consistent with how `stop()` handles it). The rebuild will re-index the renamed entity via its normal startup scan.

### 2. Missing test — `stop()` during pending deletion

The plan requires: "Test: `stop()` during pending deletion → no timer leak, deletion committed." No such test was added. The true-deletion test covers the timer-expiry path but not the `stop()` path, which calls `drainAll()` directly.

---

## Design

### 3. `syncAspect` fallthrough to DB lookup after collision

`watcher.ts:180–215` — When `renameCheck.kind === "collision"`, the collision is handled, but there is no early return or `else`. Execution falls through to `const bufferRename = ...` where `bufferRename` is `null`, and then into `if (!bufferRename)` — the DB lookup block. The DB lookup correctly finds nothing for the new UUID and proceeds normally, so there's no broken behavior. But the comment above the block says "DB lookup only when no buffer rename was detected", which is wrong — it also runs after a collision.

`syncNote`/`syncReference` use `else if (cascadeCallbacks)` and avoid this fallthrough entirely. The three sync functions should handle this case consistently. The aspect structure is harder to read and will invite mistakes when touched next.

### 4. Upserts are UUID-keyed (Phase 1 satisfied) but UNIQUE constraints on `key` and `filePath` are unguarded

`indexer/upserts.ts:53,76,94` — All three upserts use `onConflictDoUpdate({ target: <table>.uuid })`. Phase 1 is satisfied on that count. However, all three tables also declare `key` and `filePath` as `UNIQUE`. Those columns are not listed as conflict targets, so SQLite's `onConflictDoUpdate` does not cover them. The upsert handles a UUID collision cleanly; it does not handle a key or filePath collision.

Today, the collision path in `syncNote`/`syncReference`/`syncAspect` deletes the old row before the upsert runs, which prevents the key/filePath conflict from reaching the DB layer. Correctness is therefore contingent on collision detection always running ahead of the upsert — there is no in-DB fallback if it doesn't (e.g. if the `unlink` handler found no DB row and created no buffer entry, or a future code path reaches the upsert without going through `check()`).

**Steps to fix:**

1. In `upsertNote` (`indexer/upserts.ts:74`), change the single-target `onConflictDoUpdate` to also handle key/filePath conflicts:

   ```ts
   // Option A — use INSERT OR REPLACE semantics (delete-then-insert, cascades foreign keys):
   tx.insert(notesTable)
     .values({ uuid: note.uuid, key: note.key, contentHash, filePath, syncedAt })
     .onConflictDoUpdate({
       target: notesTable.uuid,
       set: { key: note.key, contentHash, filePath, syncedAt },
     })
     .run();
   // Add a second statement to handle key/filePath collisions before the insert:
   // (see step 2 for the recommended approach)
   ```

   **Recommended (Option B)** — before each upsert, delete any existing row that would collide on `key` or `filePath` but has a different UUID:

   ```ts
   // In upsertNote, upsertReference, upsertAspect — add before the insert:
   tx.delete(notesTable)
     .where(and(eq(notesTable.key, note.key), not(eq(notesTable.uuid, note.uuid))))
     .run();
   tx.delete(notesTable)
     .where(and(eq(notesTable.filePath, filePath), not(eq(notesTable.uuid, note.uuid))))
     .run();
   ```

   This makes each upsert self-sufficient — no caller needs to pre-clear conflicting rows.

2. Apply the same pattern to `upsertReference` and `upsertAspect`.

3. Update the key-collision test to verify that the upsert succeeds even when no buffer entry was created (i.e. the collision-detection path is bypassed). This exercises the upsert's own guard rather than relying on the watcher's pre-deletion.

---

## Minor

### 5. Non-null assertion in `rename-buffer.ts:49`

```ts
const collisionEntry = byUuid.get(pendingUuid)!;
```

The invariant (if `byKey` has an entry, `byUuid` must too) is correctly maintained by `add`, timer expiry, `check`, and `drainAll`. The assertion is safe. Worth noting in case the invariant is ever weakened.

### 6. Key-collision test covers notes only

The collision test exercises only notes. References and aspects go through the same `createRenameBuffer()` abstraction, so they're almost certainly fine — but the plan's testing section doesn't call this out, and a collision test per entity type would give full coverage of the unlink handler for all three.

---

## Non-issues

- **`drainAll()` before `watcher.close()` in `stop()`** — correct order. Pending deletions are committed synchronously before the chokidar watcher closes, so no events fire after drain.
- **`byUuid.clear()` after iterating in `drainAll()`** — safe. `onExpire` callbacks never add to the buffer, so no entries are added between iteration and clear.
- **Buffer rename bypasses hash guard in `syncAspect`** — intentional. A rename must always upsert (key changed), even if file content is identical.
- **`if (storedRow)` guard on unlink before creating buffer entry** — if an entity isn't in the DB, no buffer entry is created and no deletion fires. This is strictly better than the old behavior (which always emitted `deleted` even for untracked files).
