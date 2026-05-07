# Watcher Refactor

**Date**: 07-05-2026
**Status**: Todo

---

## Goal

> `watcher.ts` is split into focused modules with no repeated code: shared primitives extracted to utils, note/reference/aspect sync collapsed into a single generic handler, and if/else routing chains replaced by a lookup table.

---

## Pre-decisions

These need answering before Phase 2; they shape the generic handler.

1. **Hash guard for notes/references** — currently absent (only fragments and aspects skip on unchanged content). Decision: apply uniformly inside `syncKeyedEntity`. Reasoning: the omission looks like drift, not intent — same upsert cost, same write semantics. Behavior change is benign (skipping no-op writes). Update tests if any depend on a sync emission for unchanged content.
2. **Sync handler directory** — plan introduces `watcher/sync/`. Current layout has only `watcher/utils/`. Confirm `watcher/sync/` (handlers) is distinct from `watcher/utils/` (primitives) — keeps the boundary clean.

---

## Tasks

### Phase 1 — Extract shared primitives

- [ ] Add `watcher/utils/file.ts`: `readFileWithEnoentGuard(absolutePath, label, log): Promise<string | null>` — replaces the identical try/catch ENOENT block currently copied into all four sync functions. Returns `null` on ENOENT, throws other errors.
- [ ] Add `watcher/utils/uuid.ts` with TWO helpers (one is not enough — see "Errors found" below):
  - `ensureUuid(parsed, absolutePath, rawContent, log, label): Promise<{ uuid: string; rawContent: string; wasAssigned: boolean }>` — if frontmatter UUID missing, generate, serialize, write back, return updated `rawContent`. The `wasAssigned` flag lets fragment skip the redundant collision check on a freshly minted UUID.
  - `assignNewUuid(parsed, absolutePath, log, label): Promise<{ uuid: string; rawContent: string }>` — used by the fragment collision-resolution path to mint a new UUID and write back. Shared serialize/write-back logic with `ensureUuid`.
  - **Important**: `serializeFile` is called with `{ frontmatter, inlineFields, body }` in fragments and `{ frontmatter, body }` elsewhere. Pass `parsed.inlineFields` through unconditionally — it's empty for non-fragment entities, so this is safe and removes a special case.

### Phase 2 — Generic keyed-entity sync

- [ ] Add `watcher/sync/keyed-entity.ts`: `syncKeyedEntity(config, absolutePath, entityRelativePath)` — single function covering aspects, notes, references. Parameterized by `EntityConfig`:
  - `label` (for log messages: `"aspect"`, `"note"`, `"reference"`)
  - `table` (drizzle table reference — must expose `uuid`, `key`, `contentHash`, `filePath` columns; all three keyed tables qualify)
  - `renameBuffer` (instance — watcher-scoped, passed in)
  - `mapper.fromFile(parsed, entityRelativePath)`
  - `upsert(tx, entity, entityRelativePath, rawContent)`
  - `deleteByFilePath(tx, filePath)` (used by the rename-buffer collision branch)
  - `cascadeRename?: (oldKey: string, newKey: string) => Promise<void>` (optional — the watcher passes `cascadeCallbacks?.onAspectRename` etc.)
  - Event types: `synced` (`"aspect:synced" | "note:synced" | "reference:synced"`), `deleted` (`"aspect:deleted" | "note:deleted" | "reference:deleted"`)
  - `emit(event)` callback
- [ ] **Preserve the aspect's `isDbRename` early-return semantics exactly**: hash guard fires only when no rename was detected (neither buffer-rename nor DB-rename). Today this is correct only for aspect; with the uniform hash guard it must apply to notes/references too. Concretely: if `isDbRename || isBufferRename`, skip the hash-match early return and proceed to upsert.
- [ ] Add `watcher/sync/fragment.ts`: extract `syncFragment` (stays its own function — UUID collision detection and `knownAspectKeys` loading don't fit `EntityConfig`). Internally uses `ensureUuid` + `assignNewUuid` from Phase 1.
- [ ] Add `watcher/sync/pieces.ts`: extract `syncPieces`. Note: pieces are not keyed entities and do not flow through `syncKeyedEntity`.

### Phase 3 — Routing table

- [ ] Add `watcher/utils/constants.ts` (or fold into chokidar-config): export `FRAGMENT_PREFIX`, `ASPECT_PREFIX`, `NOTE_PREFIX`, `REFERENCE_PREFIX`, `PIECE_PREFIX`. Currently defined inline inside `createVaultWatcher` and TODO'd.
- [ ] Replace the if/else chain in `handleAddOrChange` with a routing table. Two route shapes:
  - **Keyed** (aspect, note, reference) → calls `syncKeyedEntity` with the appropriate `EntityConfig`
  - **UUID-only** (fragment) → calls `syncFragment`
  - **Pieces** → calls `syncPieces` with the `vaultRelativePath` (no entity-relative strip)
- [ ] Replace the if/else chain in `handleUnlink` with the same routing table. Two route shapes:
  - **Keyed** → look up the row by `filePath`, schedule a rename-buffer entry whose `onExpire` deletes and emits
  - **UUID-only** (fragment) → delete immediately and emit (no rename buffer)
  - Pieces are not deleted via unlink, they are consumed and removed by `vault.pieces.consume`.
- [ ] The router strips the prefix once per dispatch — `toEntityRelativePath` becomes a trivial `slice` call at the routing site. Either inline it or keep the helper for readability (low value either way).
- [ ] Extract chokidar config object to `watcher/utils/chokidar-config.ts` (existing TODO in code).

### Phase 4 — Thin orchestrator

- [ ] Reduce `watcher.ts` to: create logger, create rename buffers, build routing table, wire chokidar events, expose the `VaultWatcher` API. No sync logic, no per-entity branches.

---

## Errors found in the previous draft

1. **`ensureUuid` signature was wrong.** `Promise<string>` is insufficient — after writing back a freshly assigned UUID, the code re-reads `rawContent = rewritten` so the hash guard reflects the rewritten file. The helper must return `{ uuid, rawContent }` (and ideally `wasAssigned`).
2. **Fragment write-back logic was glossed over.** The fragment path writes back twice in two distinct branches (missing UUID, and collision-detected UUID). "Calling `ensureUuid` first" doesn't cover the second write-back. Solution: a sibling `assignNewUuid` helper that does the same serialize-and-write, called by the collision-resolution branch.
3. **`serializeFile` asymmetry was not addressed.** Fragments pass `inlineFields`; aspects/notes/references don't. The unified helper must handle both — passing `parsed.inlineFields` through unconditionally is safe (empty array for non-fragment entities).
4. **"Delete function" was ambiguous.** In `EntityConfig`, the delete function is invoked from the rename-buffer's `onExpire` callback during unlink, not from the sync function. The sync function only deletes on the rename-buffer **collision** branch (different file took the same key slot). Worth spelling out so it isn't wired wrong.
5. **The router needs to distinguish keyed vs UUID-only entities.** Fragments have no rename buffer and delete immediately on unlink; aspects/notes/references go through the rename buffer. A flat table mapping prefix → handler isn't enough — the unlink side needs two route shapes (or two tables).
6. **The hash guard "decide later" was a non-decision.** It blocks Phase 2 because `EntityConfig` either has the guard or doesn't. Decided up front (see Pre-decisions).
7. **Aspect's `isDbRename` early-return logic was missing from the spec.** When generalizing, the precise condition `!isBufferRename && !isDbRename && hashMatch → return` must be preserved. Without this note, a naive port can either drop the guard for aspect or apply it incorrectly when a rename is in flight.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Existing tests in `packages/storage/src/__tests__/watcher.test.ts` (371 lines) should continue to pass without modification. Spot-check the rename-detection, cascade-rename, and collision suites since they exercise every code path in the generic handler.
- If notes/references gain a hash guard, add a test asserting that a no-op write (touch with identical content) does **not** emit a `*:synced` event. This is the only intentional behavior change.
- The fragment UUID-collision test must keep passing — `assignNewUuid` is exercised here.

---

## Notes

- `EntityConfig` lives in `watcher/sync/keyed-entity.ts`, not in `types.ts` — implementation detail of the sync layer, not the public watcher interface.
- Rename-buffer instances stay in `watcher.ts` (watcher-scoped state), passed into each `EntityConfig`.
- Fragment stays separate from the generic handler — do not force it into `EntityConfig` by special-casing UUID collision. Two code paths is cleaner than one leaky abstraction.
- `loadKnownAspectKeys` is loaded per-call in both `syncFragment` and `syncPieces` today. Keep that — caching is out of scope.
- The pause/resume race window noted in `watcher.ts` (handler past the `if (isPaused) return` check, mid-await when `pause()` is called) is **out of scope**. Refactor preserves current behavior; fix tracked separately in `references/reviews/storage-sync-spec-fixes-2026-04-23.md`.

DO NOT IMPLEMENT until clearly stated by the developer.
