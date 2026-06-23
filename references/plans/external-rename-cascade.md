# Plan: External Rename Cascade for Notes, References, and Aspects

**Date**: 06-05-2026
**Status**: Done
**Specs**: `specifications/fragment-model.md`

---

## Goal

When a note, reference, or aspect file is renamed directly in the vault (outside Maskor), the watcher detects the rename via UUID correlation and fires the existing `onNoteRename` / `onReferenceRename` / `onAspectRename` callbacks, so linked fragments are updated automatically.

---

## Tasks

### Phase 1 — Verify upsert keying

- [ ] Confirm that `upsertNote`, `upsertReference`, and `upsertAspect` resolve conflicts by UUID (not by filename/key) — required to ensure a same-key file created during the buffer window upserts cleanly without colliding with the pending record

### Phase 2 — Pending deletion buffer

- [ ] Add an in-memory pending-deletion map in `watcher.ts`: `Map<uuid, { oldKey: string; timer: Timer }>` — one each for notes, references, and aspects
- [ ] Maintain a parallel reverse-lookup `Map<key, uuid>` kept in sync with the pending map — needed for key-collision detection
- [ ] On `unlink` for a note/reference/aspect: read the UUID from the DB before deleting, store `{ oldKey, timer }` in the map with a ~500ms timeout; on timeout expiry, commit the deletion and remove from both maps
- [ ] On `add` for a note/reference/aspect in `syncNote` / `syncReference` / `syncAspect`:
  - If UUID is in the pending map → rename detected: cancel timer, fire cascade callback with `(oldKey, newKey)`, remove from both maps, continue with normal upsert
  - Else if incoming key is in the reverse-lookup map → different file taking the same key slot: commit the pending deletion for that key immediately (cancel timer, delete from DB), remove from both maps, then continue with normal upsert

### Phase 3 — Cleanup and edge cases

- [ ] Ensure a true deletion (no matching `add`) still commits correctly when the timer fires
- [ ] Ensure both maps are cleared on `watcher.stop()` (cancel all pending timers, commit any outstanding deletions)
- [ ] Verify pause/resume does not leave stale entries in the buffer

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Test: rename note externally → `onNoteRename` fires with correct old/new keys, fragment notes list updated
- Test: rename reference externally → `onReferenceRename` fires with correct old/new keys
- Test: rename aspect externally → `onAspectRename` fires with correct old/new keys
- Test: true deletion (no add follows) → deletion commits after timeout, no callback fires
- Test: new file created with same key during buffer window → no conflict, upserts cleanly
- Test: `stop()` during pending deletion → no timer leak, deletion committed

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.
