# Entity content swap files

**Date**: 19-05-2026
**Status**: Todo
**Specs**: `specifications/prompting.md`

---

## Goal

While the user edits the prose content of an entity (fragment, aspect, note, reference), every change writes a swap file under `.maskor/swap/<entityType>/<entityUUID>.json` via the API. If Maskor crashes, the browser closes, the tab refreshes, or the user navigates away before saving, the next time that entity opens its cached content pre-loads into the editor and a recovery banner offers "Restore from server." On successful save the swap file is deleted. Metadata fields are explicitly out of scope: the existing debounced auto-save is kept as-is, and the last-debounce-window loss on crash/close is accepted.

---

## Tasks

### Phase 1 — Branch + backend swap storage layer

- [ ] Create branch `entity-content-swap-files` from `main`.
- [ ] Add a swap storage module (`packages/storage/src/swap/`) exposing `write`, `read`, `delete`, `list` against `<vaultPath>/.maskor/swap/<entityType>/<entityUUID>.json`.
- [ ] File format: `{ content: string, savedAt: ISO8601 }`. Single file per entity covers content only (no metadata fields).
- [ ] `entityType` validated against the known set: `fragment | aspect | note | reference`. Unknown types reject at the storage boundary.
- [ ] Confirm the chokidar config already ignores `.maskor/` (`packages/storage/src/watcher/chokidar-config.ts` confirms it does via the dotfile regex). Add a regression test that creating a swap file does not produce a watcher event.
- [ ] Swap writes skip `withVaultWriteLock` (transient state, not part of the canonical vault — same exclusion rationale as `actionLog.append`). Document this in `packages/storage/CLAUDE.md`.
- [ ] Swap writes do NOT append to the action log.
- [ ] Unit tests for the storage module: round-trip write/read/delete, list, missing-file read returns null, unknown `entityType` rejected, malformed JSON on disk treated as no-swap (and the bad file moved aside to `<file>.corrupt` so the next write succeeds).

### Phase 2 — API routes + codegen

- [ ] Add `packages/api/src/routes/swap.ts` with: `PUT /projects/:projectId/swap/:entityType/:entityUUID`, `GET /projects/:projectId/swap/:entityType/:entityUUID`, `DELETE /projects/:projectId/swap/:entityType/:entityUUID`.
- [ ] `PUT` body: `{ content: string }`. Response: `{ savedAt: ISO8601 }`.
- [ ] `GET` response: `{ content: string, savedAt: ISO8601 }` on hit, `404` on miss.
- [ ] `DELETE` is idempotent — missing file returns success.
- [ ] OpenAPI annotations on all three routes so orval picks them up.
- [ ] Regenerate the frontend orval client (`bun run codegen` from `packages/frontend` per `packages/frontend/CLAUDE.md`).
- [ ] Integration tests for each route: success, missing project, unknown entity type, idempotent delete.

### Phase 3 — Frontend hook

- [ ] Add `useEntityContentSwap` in `packages/frontend/src/hooks/`. Inputs: `projectId`, `entityType`, `entityUUID`, `currentValue` (the live editor content), `serverValue` (the entity's content as last fetched from the server), optional `debounceMs` (default 150ms — local server, latency is low, so a tight window is cheap).
- [ ] Built on the orval-generated `usePutSwap`, `useGetSwap`, `useDeleteSwap` hooks. Do NOT hand-roll `useMutation` per `packages/frontend/CLAUDE.md`.
- [ ] Mount-time read: query the swap endpoint; if a hit exists AND `cached.content !== serverValue`, expose `{ cachedContent, cachedAt }` to the caller. Otherwise expose `null`.
- [ ] Per-change debounced PUT.
- [ ] `clear()` method that fires `DELETE`. Called by the caller on successful save.
- [ ] No `beforeunload` handler — the tight debounce window makes the worst-case loss small (~150ms of typing), and accepting this loss is the explicit tradeoff. Document this in the hook's comments.
- [ ] Failure mode: if the PUT fails (rare — local API), surface no UI; retry on next change. Log a single warning per session.
- [ ] Unit tests: mount-time hit triggers recovery, miss does not, debounced write fires, clear deletes, divergence comparator behavior, PUT failure does not throw.

### Phase 4 — Integrate with `EntityEditorShell`

- [ ] Add `entityKind: "fragment" | "aspect" | "note" | "reference"` and `entityUUID: string` props to `EntityEditorShell` (the existing `entityKey` is human-readable; the swap key needs the UUID).
- [ ] Inside the shell, instantiate `useEntityContentSwap` with the incoming `content` prop as `serverValue` and the live editor content as `currentValue`.
- [ ] On mount, if the hook reports a divergent cached value: push it into the prose editor via a new `ProseEditor` ref method (`setContent(value)`) and mark dirty. The recovery banner renders in the shell's existing `banner` slot.
- [ ] On `onProseChange` (already wired), call the hook's per-change write.
- [ ] On the existing `saveContent` callback's success path (after `onContentSave` resolves), call `clear()`.
- [ ] On save failure, leave the swap in place (the unsaved content is still unsaved).
- [ ] Update each consumer of `EntityEditorShell` to pass the new `entityKind` and `entityUUID` props.

### Phase 5 — Recovery banner component

- [ ] Add `UnsavedRecoveryBanner` in `packages/frontend/src/components/` with props: `cachedAt: Date`, `onDismiss: () => void` (the "Restore from server" action).
- [ ] Copy: `"You have unsaved changes from {relativeTime}. They've been restored."` plus a "Restore from server" button.
- [ ] If a `formatRelativeTime` helper exists in the codebase, reuse it; otherwise add a small one next to the banner. Check before duplicating.
- [ ] Unit test: renders the relative time, calls `onDismiss` on click.

### Phase 6 — Verification + cleanup

- [ ] Manual browser verification (dev-browser skill or local Vite dev):
  - Edit a fragment, refresh → swap restores, banner appears.
  - Edit a fragment, close + reopen tab → swap restores, banner appears.
  - Edit a fragment, save successfully → no banner on re-entry.
  - Edit a fragment, click "Restore from server" → swap cleared, server content shown.
  - Repeat the first three for aspect, note, reference editors.
  - Confirm metadata edits (e.g. fragment key rename) do NOT create swap files.
- [ ] Run `bun run verify` and fix any type or test issues.
- [ ] Update `references/suggestions.md`: remove `#29` (entity-navigation cache, now covered by swap files for content; metadata loss explicitly accepted) and `#30` (sendBeacon for live-field saves, superseded by the decision to accept metadata loss).
- [ ] `git commit` per phase or per sensible batch.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specific coverage required:

- Backend swap storage: write/read/delete/list, missing-file is null, malformed JSON quarantined, unknown entity type rejected.
- API routes: success paths, 404 on missing swap (GET), 404 on missing project, idempotent delete.
- Watcher exclusion: creating a swap file produces zero watcher events.
- `useEntityContentSwap`: mount-time hit/miss, debounced write, clear, divergence comparison, PUT failure non-throwing.
- `EntityEditorShell` with swap: mount-time recovery hydrates the editor and marks dirty, save clears swap, save failure retains swap, banner renders and dismisses correctly.

Browser verification scenarios listed in Phase 6 must pass before status moves to `Done`.

---

## Notes

Key decisions reached before planning:

- **Metadata loss on crash/close is accepted.** A change to a metadata field followed immediately by a hard close means that change might not have been saved. The user accepts this — it's anticipatable and recoverable by re-entering the value. No caching layer for metadata.
- **Entity content is protected.** Prose loss is unacceptable in a writing tool. Swap files cover this.
- **Server-side swap, not localStorage.** localStorage is capped at ~5MB per origin and is browser-keyed; swap files live with the vault, are disk-bound, survive browser data clear and browser switch, and are recoverable from outside Maskor with a text editor or `grep` if Maskor itself crashes. The vim swap-file analogy fits.
- **Format is JSON, not raw markdown.** The savedAt timestamp is explicit in the body rather than implicit in file mtime. Slightly more robust against filesystem timestamp weirdness.
- **No `beforeunload` flush.** The HTTP-based swap mechanism can't be synchronous in `beforeunload`. The tradeoff: accept the loss of typing within the last debounce window (~150ms). Tighter than the metadata save debounce (400ms) so the worst case is smaller for content than metadata.
- **Multi-tab is out of scope.** Two tabs editing the same entity: last swap write wins. Same scope decision as the original plan.
- **`.maskor/swap/` is hidden under `.maskor/` which the watcher already ignores via the dotfile regex.** No watcher config change required, just a regression test.
- **Swap writes skip the vault write lock and the action log** — same rationale as `actionLog.append`: transient state outside the canonical record.

This plan supersedes suggestions `#29` (temporary unsaved-edit cache for entity navigation) and `#30` (flush live-field saves on tab close/refresh via sendBeacon). The localStorage-cache approach drafted in the prior version of this plan was abandoned in favor of server-side swap files for the reasons listed above.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
