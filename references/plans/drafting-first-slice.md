# Drafting — first slice

**Date**: 18-05-2026
**Status**: Todo
**Specs**: `specifications/drafting.md`

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
- [ ] `git commit` — add Draft types and draft action-log entries.

### Phase 2 — In-flight write-handler drain

> Closes the async race window flagged in `packages/storage/src/watcher/watcher.ts:290-296` and `references/SUGGESTIONS.md`. Without this, a `pause()` between an event handler's `if (isPaused) return` check and its DB upsert can still produce a partial-update snapshot.

- [x] Extracted in-flight tracker into `watcher/utils/in-flight-tracker.ts`; handlers wrap `enter` / `try / finally exit`. _(2026-05-18)_
- [x] `pause()` is async: sets `isPaused` then awaits the tracker. _(2026-05-18)_
- [x] `index.rebuild` in `storage-service.ts` awaits `watcher.pause()`. _(2026-05-18)_
- [x] Removed the TODO comment block from watcher.ts. _(2026-05-18)_
- [x] Tests in `__tests__/in-flight-tracker.test.ts`: drain semantics, multi-enter coalescing, multi-waiter, negative-guard. _(2026-05-18)_
- [-] _(skipped — no matching entry in references/suggestions.md; the watcher.ts TODO was the canonical reference and is now removed)_
- [ ] `git commit` — drain in-flight watcher handlers on pause.

### Phase 3 — Storage primitives for drafts

- [x] Created `packages/storage/src/drafts/` (constants, paths, errors, manifest, disk-space, cleanup, mutex, create, list, delete, restore, index). _(2026-05-18)_
- [x] Added `vacuumVaultDatabaseInto` helper in `db/vault/index.ts` so create.ts can `VACUUM INTO` the live DB. _(2026-05-18)_
- [x] Case-insensitive name uniqueness enforced in `create.ts`. _(2026-05-18)_
- [x] Disk-space pre-check using `statfs`. _(2026-05-18)_
- [x] Atomic staging → rename → cleanup empty staging parent. _(2026-05-18)_
- [x] Restore rollback path: track moved-aside and copied-into-live, undo both on failure. _(2026-05-18)_
- [x] Mutex per vault path with `DRAFT_OPERATION_IN_PROGRESS` error. _(2026-05-18)_
- [x] Tests covering create / list / delete / restore / cleanup / mutex (21 cases). Disk-space refusal not unit-tested — `statfs` is hard to mock portably; the path is covered by integration. _(2026-05-18)_
- [ ] `git commit` — add storage primitives for drafts.

### Phase 4 — Wire drafts into the storage service

- [ ] In `packages/storage/src/service/storage-service.ts`, add a `drafts` namespace exposing `create(ctx, { name, note? })`, `list(ctx)`, `delete(ctx, draftUuid)`, `restore(ctx, draftUuid)`.
  - Each operation: `await watcher.pause()` → run the drafts primitive (with the storage write lock held, see below) → `watcher.resume()`.
  - For `restore`, after the file swap, call `getVaultIndexer(context).rebuild()` before resuming the watcher. Then emit a `vault.restored` event via the watcher's event channel (Phase 5 adds the type).
  - Wrap concurrent attempts in the module-level draft-ops mutex from Phase 3.
- [ ] Add a storage write lock at the service level. The lock is a simple async semaphore that the drafts namespace acquires. Mutating routes (fragments / aspects / notes / references / sequences) already serialize through the watcher/indexer in most cases — for v1, drafts.create/restore acquire the lock and other writes proceed normally. Spec § Constraints states the snapshot must drain in-flight writes; combine the existing per-vault path operations via the watcher's drain (Phase 2) so writes complete before the snapshot copy begins.
- [ ] In project resolve (search `storage-service.ts` for the project resolve path — `register`/`resolve` around line 456), call `cleanupStaleDirectories` from Phase 3 before returning the context.
- [ ] Tests in `packages/storage/src/__tests__/`: stale `.staging/` removed on resolve; create/list/delete/restore round-trip through service; concurrent create rejects with `DRAFT_OPERATION_IN_PROGRESS`.
- [ ] `git commit` — wire drafts into storage service with cleanup-on-resolve.

### Phase 5 — `vault.restored` SSE event

- [ ] Extend `VaultSyncEvent` in `packages/shared/src/events.ts` with `{ type: "vault:restored"; draftUuid: string }`. Add `"vault:restored"` to `VAULT_SYNC_EVENT_TYPES`.
- [ ] In the watcher (`watcher.ts`), expose a way for the storage service to emit a synthetic event to subscribers. Simplest: add a `emit(event: VaultSyncEvent)` method on the watcher returned object that pushes into the same subscriber set.
- [ ] In `drafts` service `restore`, after the index rebuild, emit `{ type: "vault:restored", draftUuid }` via that emit method.
- [ ] Verify the SSE route at `packages/api/src/routes/events.ts` forwards the new variant without changes (it should, since it iterates the union).
- [ ] Tests: subscribing to vault events sees exactly one `vault:restored` per restore call.
- [ ] `git commit` — emit vault:restored SSE event on draft restore.

### Phase 6 — Commands and routes

- [ ] Add commands in `packages/api/src/commands/drafts/`:
  - `create-draft.ts`: `Command<{ name, note? }, DraftManifest>` — calls `storageService.drafts.create`, emits a `draft:created` log entry with `target = { type: "draft", uuid, key: slug, title: name }` and payload `{ name, note }`.
  - `delete-draft.ts`: `Command<{ draftUuid }, void>` — calls `storageService.drafts.delete`, emits `draft:deleted` with payload `{ name }` (name comes from the manifest deleted-before-removal).
  - `restore-draft.ts`: `Command<{ draftUuid, saveCurrentFirst, preRestoreName? }, { restoredDraftUuid, preRestoreDraftUuid?: string }>`. If `saveCurrentFirst`, calls `drafts.create` with the supplied or default `Pre-restore — {ISO timestamp}` name **first**. If that fails, the command aborts and surfaces the error before calling `restore`. The command emits TWO log entries on success: `draft:created` (for the pre-restore safety draft) and `draft:restored` (referencing both UUIDs). Matches acceptance criterion: two log-entries in order for the save-then-restore flow.
- [ ] Export from `packages/api/src/commands/index.ts`.
- [ ] Add `packages/api/src/routes/drafts.ts` with the router (Hono + zod-openapi):
  - `POST /api/projects/:projectId/drafts` → create. 400 on duplicate name (case-insensitive); 507 on disk-space refusal; 409 on `DRAFT_OPERATION_IN_PROGRESS`.
  - `GET /api/projects/:projectId/drafts` → list. Read-only, calls `storageService.drafts.list` directly (per `packages/api/CLAUDE.md`).
  - `DELETE /api/projects/:projectId/drafts/:draftUuid` → delete. 404 on missing draft.
  - `POST /api/projects/:projectId/drafts/:draftUuid/restore` → restore. Body: `{ saveCurrentFirst: boolean; preRestoreName?: string }`. 404 on missing draft; 409 on in-progress.
- [ ] Mount the router in `packages/api/src/app.ts` next to the other project-scoped routers (around line 84-93).
- [ ] Regenerate the frontend client: from `packages/frontend`, `bun run codegen` with the API running.
- [ ] Tests in `packages/api/src/__tests__/routes/drafts.test.ts`: 200 happy paths for all four endpoints; duplicate-name 400; missing-draft 404; concurrent-create 409; `draft:created` followed by `draft:restored` in the action log after a save-then-restore.
- [ ] `git commit` — add draft commands and routes.

### Phase 7 — Frontend Drafts page

- [ ] Add route `/projects/$projectId/drafts` in `packages/frontend/src/router.ts`, mounted under `projectShellLayoutRoute`.
- [ ] Add a "Drafts" nav item to the project shell layout next to the existing Fragments / Overview / Action log / Statistics entries.
- [ ] Create `packages/frontend/src/pages/DraftsPage/` with:
  - `DraftsPage.tsx` — header with "Create draft" button, drafts list below.
  - `CreateDraftDialog.tsx` — modal with `name` (default `Draft N` where N = drafts count + 1, per spec § Naming and uniqueness), optional `note`, and a "Create" button. Disables on submit. Shows server-side validation errors inline (duplicate name, disk-space refusal).
  - `DraftListItem.tsx` — name, created date (locale-formatted), note (if any), entity counts as a small summary line ("12 fragments · 4 aspects · 3 notes · 2 references · 1 sequence"). Per-row actions: "Restore", "Delete".
  - `RestoreDraftDialog.tsx` — confirmation modal with the safety checkbox default-on. Editable pre-restore name field (defaults to `Pre-restore — {ISO timestamp}` per spec § Restoring a draft step 1). Disables and shows progress while the request is in flight.
  - `DeleteDraftDialog.tsx` — confirmation modal naming the draft. No additional inputs.
- [ ] Use orval-generated hooks: `useCreateDraft`, `useListDrafts`, `useDeleteDraft`, `useRestoreDraft`.
- [ ] After a successful restore, invalidate the project's fragment / aspect / note / reference / sequence queries and the action-log query so the rest of the app reflects the restored state. The `vault:restored` SSE event from Phase 5 will also trigger invalidations through the existing event subscription — confirm during testing that the explicit invalidation isn't double-triggering anything broken.
- [ ] Tests in `packages/frontend/src/pages/DraftsPage/__tests__/`:
  - `DraftsPage` renders an empty state when the list is empty and a list when populated.
  - "Create draft" opens the dialog with the default name; submit calls the hook with `{ name, note }`.
  - "Restore" with the checkbox on calls the restore hook with `saveCurrentFirst: true`; with the checkbox off, passes `false`.
  - "Delete" requires confirmation; calling it invokes the delete hook with the right uuid.
- [ ] `git commit` — add Drafts page with create / list / delete / restore.

### Phase 8 — Spec sync and plan close-out

- [ ] Update `specifications/drafting.md`:
  - Add `**Shipped**: 2026-MM-DD — first slice (create, list, delete, restore). Rename and polish items deferred. See `references/plans/drafting-first-slice.md`.` to the frontmatter (mirroring `specifications/export.md` line 6 pattern).
  - Resolve open question #3 by removing it (drained in-slice — done).
- [ ] Set this plan's `Status` to `Done` (or `In progress` if shipped partially), set `Closed` date.
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
