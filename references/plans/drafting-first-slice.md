# Drafting — first slice

**Date**: 18-05-2026
**Status**: Done
**Specs**: `specifications/drafting.md`
**Closed**: 19-05-2026

---

## Goal

A user can open a Drafts surface inside a project, click "Create draft", give it a name and optional note, and see the resulting draft appear in a list with its name, creation date, note, and entity counts. From the list they can delete any draft (with confirmation) and restore the project to any draft (with the default-on "Save current state as a draft first" safety checkbox). Snapshot creation does not interleave with in-flight write handlers, fails atomically (no partial drafts on disk), and stale `.staging/` or `.restore-aside/` directories from an interrupted operation are cleaned up automatically at project resolve.

> This is the create + list + delete + restore cycle. Out of this slice: renaming drafts (spec § Renaming), the soft-cap warning, visual distinction of pre-restore drafts, and the per-draft preview / per-draft markdown export deferrals already listed in spec § Out of scope.

---

## Scope decisions captured here

These resolve open questions or in-spec call-outs that the spec deferred to plan time:

- **In-flight write drain lands in this slice, not before it.** The spec's open question #3 asks whether the drain fix (currently a TODO at `packages/storage/src/watcher/watcher.ts:290-296`) is a prerequisite or rides alongside. Drain is load-bearing for safe snapshotting, so it goes in Phase 2 of this slice. Treating it as a standalone prerequisite would split work that has no consumer outside drafting.
- **Action-log entry types use the colon convention.** The codebase uses colons (`fragment:created`, `sequence:created`). The plan adopts the same (`draft:created`, `draft:deleted`, `draft:restored`). Spec § Behavior and § Acceptance criteria were updated to colon-form on 2026-05-18 before implementation; no further sync needed.
- **`LogEntryTarget` gains a `draft` type.** The existing union (`fragment`, `aspect`, `note`, `reference`, `sequence`) does not include drafts; adding it is the cleanest place to record `draft.uuid` + `draft.name` on each entry.
- **Rename is deferred.** Rename is metadata-only and easy, but it has zero blocking value next to create / list / restore. Keeping it out lets this slice stay focused on the snapshot pipeline. The `draft:renamed` action-log entry type is added in the rename slice.
- **First-slice UI surface: a tab under the project shell.** Mirrors how `ActionLogList` and `ProjectStatistics` live as project-scoped pages. No global drafts surface, no inline drawer.

---

## Tasks

### Phase 1 — Branch and shared types

- [x] Create branch `drafting-first-slice` from `main`. _(2026-05-18)_
- [x] Add `Draft` and `DraftManifest` types in `packages/shared/src/`. _(2026-05-18)_
- [x] Extend `LogEntryTargetSchema.type` with `"draft"`. _(2026-05-18)_
- [x] Extend `ActionTypeSchema` and the discriminated union with `draft:created`, `draft:deleted`, `draft:restored`. _(2026-05-18)_
- [x] Tests: schema parse round-trip in `packages/shared/src/__tests__/draft-schemas.test.ts`. _(2026-05-18)_
- [x] `git commit` — add Draft types and draft action-log entries. _(884ffe8)_

### Phase 2 — In-flight write-handler drain

> Closes the async race window flagged in `packages/storage/src/watcher/watcher.ts:290-296` and `references/suggestions.md`. Without this, a `pause()` between an event handler's `if (isPaused) return` check and its DB upsert can still produce a partial-update snapshot.

- [x] Extracted in-flight tracker into `watcher/utils/in-flight-tracker.ts`; handlers wrap `enter` / `try / finally exit`. _(2026-05-18)_
- [x] `pause()` is async: sets `isPaused` then awaits the tracker. _(2026-05-18)_
- [x] `index.rebuild` in `storage-service.ts` awaits `watcher.pause()`. _(2026-05-18)_
- [x] Removed the TODO comment block from watcher.ts. _(2026-05-18)_
- [x] Tests in `__tests__/in-flight-tracker.test.ts`: drain semantics, multi-enter coalescing, multi-waiter, negative-guard. _(2026-05-18)_
- [-] _(skipped — no matching entry in references/suggestions.md; the watcher.ts TODO was the canonical reference and is now removed)_
- [x] `git commit` — drain in-flight watcher handlers on pause. _(b8fb933)_

### Phase 3 — Storage primitives for drafts

- [x] Created `packages/storage/src/drafts/` (constants, paths, errors, manifest, disk-space, cleanup, mutex, create, list, delete, restore, index). _(2026-05-18)_
- [x] Added `vacuumVaultDatabaseInto` helper in `db/vault/index.ts` so create.ts can `VACUUM INTO` the live DB. _(2026-05-18)_
- [x] Case-insensitive name uniqueness enforced in `create.ts`. _(2026-05-18)_
- [x] Disk-space pre-check using `statfs`. _(2026-05-18)_
- [x] Atomic staging → rename → cleanup empty staging parent. _(2026-05-18)_
- [x] Restore rollback path: track moved-aside and copied-into-live, undo both on failure. _(2026-05-18)_
- [x] Mutex per vault path with `DRAFT_OPERATION_IN_PROGRESS` error. _(2026-05-18)_
- [x] Tests covering create / list / delete / restore / cleanup / mutex (21 cases). Disk-space refusal not unit-tested — `statfs` is hard to mock portably; the path is covered by integration. _(2026-05-18)_
- [x] `git commit` — add storage primitives for drafts. _(810c8c4)_

### Phase 4 — Wire drafts into the storage service

- [x] Added a `drafts` namespace on the storage service with `create`, `list`, `delete`, `restore`. Each operation runs through the per-vault draft mutex; create pauses the watcher (draining writes), restore fully tears down the watcher + DB handle and rebuilds. _(2026-05-18)_
- [x] `cleanupStaleDirectories` invoked from `resolveProject` before the context is returned. _(2026-05-18)_
- [x] Service-level integration tests cover create/list/delete round-trip, restore + vault:restored emission, duplicate-name rejection, action-log / project.json preservation across restore, and stale-directory cleanup on resolve. _(2026-05-18)_
- [-] _(scope adjustment: the planned generic storage write lock turned out to be unnecessary. The per-vault draft mutex + watcher drain already covers the spec's "snapshot must drain in-flight writes" constraint. A general write lock can land later when a non-draft caller needs it.)_
- [x] `git commit` — wire drafts into storage service + emit vault:restored. _(3c845b9)_

### Phase 5 — `vault:restored` SSE event

- [x] Extended `VaultSyncEvent` and `VAULT_SYNC_EVENT_TYPES` with `vault:restored`. _(2026-05-18)_
- [x] Refactored watcher subscribers out of the watcher and onto the storage service so SSE clients survive watcher teardown across restore. `createVaultWatcher` now takes an `emit` callback; the storage service owns the per-project subscriber bus and proxies subscribe/unsubscribe. _(2026-05-18)_
- [x] `drafts.restore` emits `vault:restored` through the service bus after the index rebuild. _(2026-05-18)_
- [x] SSE route in `packages/api/src/routes/events.ts` forwards the new variant unchanged. _(2026-05-18)_
- [x] Test in `service.test.ts` asserts `vault:restored` is delivered to a subscriber attached before the restore call. _(2026-05-18)_
- [x] `git commit` — emit vault:restored SSE event on draft restore. _(rolled into 3c845b9)_

### Phase 6 — Commands and routes

- [x] Added commands `create-draft`, `delete-draft`, `restore-draft` under `packages/api/src/commands/drafts/`. `restoreDraftCommand` emits two log entries (pre-restore `draft:created` + `draft:restored`) when `saveCurrentFirst` is on. _(2026-05-18)_
- [x] Exported the new commands from `commands/index.ts`. _(2026-05-18)_
- [x] Added `routes/drafts.ts` with list / create / delete / restore endpoints (HTTP 201/200/204/404/409/507/400 mapping via `throwStorageError`). _(2026-05-18)_
- [x] `DraftError` exported from `@maskor/storage` and mapped in `packages/api/src/errors.ts`. _(2026-05-18)_
- [x] Mounted `draftsRouter` at `/projects/:projectId/drafts` in `app.ts`. _(2026-05-18)_
- [x] Regenerated the frontend orval client. `useListDrafts` / `useCreateDraft` / `useDeleteDraft` / `useRestoreDraft` hooks now available. _(2026-05-18)_
- [x] Route tests cover create / list / delete / restore happy paths plus duplicate-name 409 and missing-draft 404. Restore test asserts the action-log contains both `draft:restored` and `draft:created` for the save-then-restore flow. _(2026-05-18)_
- [-] _(scope adjustment: concurrent-create 409 is covered at the storage-service level by `mutex.test.ts`. Triggering it cleanly via two simultaneous HTTP requests adds flakiness for no extra signal, so not duplicated here.)_
- [x] `git commit` — add draft commands and routes. _(7ed75d0)_

### Phase 7 — Frontend Drafts page

- [x] Added `packages/frontend/src/pages/DraftsPage/` with `DraftsPage`, `CreateDraftDialog`, `DeleteDraftDialog`, `RestoreDraftDialog`, `index.ts`. _(2026-05-18)_
- [x] Registered `/projects/$projectId/drafts` in the router; added "Drafts" nav item to `ProjectShellLayout`. _(2026-05-18)_
- [x] Wired orval-generated `useListDrafts` / `useCreateDraft` / `useDeleteDraft` / `useRestoreDraft`. _(2026-05-18)_
- [x] Restore dialog invalidates project-scoped queries on success in addition to relying on the `vault:restored` SSE invalidation hook. _(2026-05-18)_
- [x] Added `vault:restored` to the SSE event type list in `useVaultEvents` so the frontend invalidates queries when the restore event lands. _(2026-05-18)_
- [x] Tests in `__tests__/DraftsPage.test.tsx`: empty state, draft list rendering, create-dialog hook wiring, delete confirm hook wiring, restore default `saveCurrentFirst=true`, restore with checkbox off. _(2026-05-18)_
- [x] `git commit` — add Drafts page with create / list / delete / restore. _(dcf9413)_

### Phase 8 — Spec sync and plan close-out

- [x] Added the `Shipped:` line to `specifications/drafting.md` and ticked open question #3. _(2026-05-19)_
- [x] Plan status flipped to `Done`, `Closed: 19-05-2026`. _(2026-05-19)_
- [ ] `git commit` — sync drafting spec with first slice shipped.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Test coverage targets for this slice:

- `@maskor/shared`: schema parse for the new action-log variants and `vault:restored` event.
- `@maskor/storage`: drafts primitives (`create`, `list`, `delete`, `restore`, `cleanup`), the mutex, watcher drain semantics, stale-directory cleanup on resolve.
- `@maskor/api`: drafts router happy + error paths, action-log entry ordering after save-then-restore.
- `@maskor/frontend`: drafts page rendering, dialog behaviors, restore-with-safety hook wiring.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
