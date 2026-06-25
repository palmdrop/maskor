# Never lose writing — defense-in-depth for the save/swap pipeline

**Date**: 25-06-2026
**Status**: In progress
**Specs**: `specifications/fragment-editor.md`, `specifications/storage-sync.md`, `specifications/fragment-split.md`
**Branch**: agent/never-lose-data <!-- implemented on the existing dedicated worktree branch, not a new agent/never-lose-writing -->

---

## Goal

> A fragment editing session can never silently lose prose: if the change-notification chain breaks, the save fails, or the swap write fails, the user is told (and given a path to copy their work), and the on-disk swap survives every DB reset and draft restore. "Done" = the data-loss vectors found in the 25-06-2026 incident investigation are closed and covered by tests.

---

## Background — the incident

Real loss: a lot of writing gone, **no "save failed" indication, and no swap file present**. Investigation (see Findings below) showed this is not three bugs but one: every safety net hangs off a single signal — the editor's change-notification chain (`TipTap onUpdate → isLoadingRef guard → onChange → setLiveContent + setIsProseDirty`). From that one signal three protections are derived, and they **all fail together, silently**, if the chain breaks:

- **Canonical save** — `entity-editor-shell.tsx` `saveContent` returns early when `!isDirty`; the Save button disables; no throw, so `editor:save`'s `onFailure: "Save failed."` never fires.
- **Swap file** — `useEntityContentSwap.ts` only writes when `currentValue !== serverValue`; if `liveContent` never diverges from server `content`, the debounce returns early and **no swap is ever written**.
- **Buffer authority** — `prose-editor.tsx` gates the "don't clobber unsaved edits" guard on `isDirty`; when `isDirty` is stuck false, a background refetch runs `editor.commands.setContent(content)` and overwrites the on-screen text with stale server content (the visible "strange state").

The concrete chain-break vector: `isLoadingRef` / `setLoading(true)` is set **without `try/finally`** in two places (`prose-editor.tsx` rich-sync effect, and `prose-editor-tiptap-adapter.ts` `setContent`). If `editor.commands.setContent(...)` or `extractTiptapAnchors(...)` throws once, the flag stays `true` for the rest of the session and TipTap's `onUpdate` returns early on every later keystroke — nothing registers as a change.

Secondary findings:

- Swap-write failures are swallowed by design (`useEntityContentSwap.ts` `onError` → `console.warn` only; `clear()` swallows). Prose has no auto-save (deferred pending version-locking), so for prose the swap **is** the only crash net — and it is silent on failure. This is `references/TODO.md` item #1.
- No `beforeunload`/`pagehide` flush exists; the swap is debounced ~150ms and best-effort, so a close mid-edit loses the tail and there is zero defense-in-depth.
- The split desync (`references/TODO.md` item #2) is the same disease: split reads fragment content from the vault, so an unsaved/desynced buffer makes the frontend and backend disagree about what is committed.

**Swap-purge investigation (done):** No current path purges `.maskor/swap/`. Dev auto-reset (`schema-fingerprint.ts deleteDatabaseFiles`) and manual `index.reset` (`db/vault.ts deleteVaultDatabaseFiles`) delete only `<db>` + `-wal` + `-shm`. Draft create/restore operate on the explicit allowlists in `drafts/constants.ts` (`fragments/aspects/notes/references` + `.maskor/{sequences,config,vault.db,project.json,action-log.jsonl}`); `swap` is in neither. The invariant holds today — but only incidentally, with no test and against a spec that declares `.maskor/` freely overwritable.

---

## Tasks

### Phase 0 — Branch

- [x] Branch — implemented on the existing dedicated worktree branch `agent/never-lose-data` (the worktree created for this work). _(2026-06-25)_

### Phase 1 — Crash-safe load guards (the direct loss vector)

Stop a single thrown load from sticking the change chain off forever.

- [x] Wrap the `isLoadingRef.current = true` … `= false` block in the rich content-sync effect (`packages/frontend/src/components/prose-editor.tsx`) in `try/finally` so the flag always clears. _(2026-06-25)_
- [x] Wrap the `setLoading(true)` … `setLoading(false)` block in `setContent` (`packages/frontend/src/components/prose-editor-tiptap-adapter.ts`) in `try/finally`. _(2026-06-25)_
- [x] Decide and document the throw behaviour: swallow + `console.error` (not rethrow — runs in effects, a propagating throw risks unmounting the editor) while the `finally` clears the guard. Full user-facing surface deferred to Phase 3. _(2026-06-25)_
- [x] Tests: a `setContent` that throws leaves the load guard cleared (`prose-editor-tiptap-adapter.test.ts`). _(2026-06-25)_
- [ ] Commit Phase 1.

### Phase 2 — Break the single-point-of-failure (dirty backstop)

The change chain must not be the *only* source of truth for "there are unsaved edits".

- [x] Add a backstop that derives dirty from a buffer-vs-server comparison inside `ProseEditor` (marker-free, trailing-whitespace-tolerant — the same check the load effects use), on a 1.5s heartbeat. When `!isDirty` yet the live buffer differs from server `content`, it fires `onChange` to re-engage the change chain. _(2026-06-25)_
- [x] Feed the backstop into swap + Save by routing through the existing `onChange` → `setLiveContent`/`setIsProseDirty` path — so once it fires, swap writes and Save enables exactly as a normal edit. No new wiring needed. _(2026-06-25)_
- [x] Respects buffer authority: when `isDirty` it does nothing (and skips serialization); firing `onChange` flips the host dirty, which then arms the existing buffer-authority guard against the next refetch. _(2026-06-25)_
- [x] Tests: a missed `onChange` (divergent `setContent` with `emitUpdate:false`) is recovered by the heartbeat; a clean fragment never fires; an already-dirty host is left alone (`prose-editor.dirty-backstop.test.tsx`). _(2026-06-25)_
- [ ] Commit Phase 2.

### Phase 3 — Surface swap and save failures (TODO #1)

The user must learn when their work is not being backed up or did not persist.

- [ ] Replace the silent `console.warn` in `useEntityContentSwap.ts` `onError` with a surfaced, persistent warning state the editor can render ("Unsaved changes are not being backed up — copy your work"). Persistent and not auto-dismissed while the failure condition holds; cleared on the next successful swap write.
- [ ] Surface a save that did not persist: distinguish "save returned non-2xx" (already routed via `editor:save` `onFailure`) from "save reported success but the buffer still differs from server after reconcile". Warn on the latter rather than silently trusting the round-trip.
- [ ] Decide the UI surface (banner near the editor vs. toast vs. both) consistent with `UnsavedRecoveryBanner` and the command-failure toast conventions in `packages/frontend/CLAUDE.md`. Prefer a non-dismissable in-editor banner for the "not backed up" state.
- [ ] Tests: a failing swap PUT raises the warning; a recovered swap clears it; a save whose reconciled content still differs raises the save warning.
- [ ] Update `references/TODO.md` (mark item #1 addressed) and the `Shipped` frontmatter of `specifications/fragment-editor.md`.
- [ ] Commit Phase 3.

### Phase 4 — Flush swap on page hide

Close the "tab closed mid-edit" tail-loss window without relying on the debounce.

- [ ] Add a `pagehide` / `visibilitychange(hidden)` flush that writes the current buffer to the swap synchronously-as-possible (best-effort; align with the existing swap write path). Prefer `pagehide`/`visibilitychange` over `beforeunload` (more reliable on mobile/bfcache).
- [ ] Reconcile with the `useEntityContentSwap.ts:31-34` comment that documents the deliberate no-flush tradeoff — update or remove it to match the new behaviour.
- [ ] Tests: a simulated `pagehide` with a dirty buffer triggers a swap write.
- [ ] Commit Phase 4.

### Phase 5 — Lock in swap survival across reset and restore

Make the "incidental" invariant explicit and regression-proof.

- [ ] Add regression tests asserting `.maskor/swap/` survives: dev auto-reset (drift path), manual `index.reset`, and draft restore. (Storage package — extend `swap.test.ts` / `drafts/restore.test.ts`.)
- [ ] Document the invariant: swap is transient per-machine unsaved-content cache and must NOT be purged by any DB reset or draft restore. Record it in `specifications/storage-sync.md` (the swap/`.maskor`-ownership section) and/or alongside the reset/restore code, so the spec's "Maskor may overwrite any file in `.maskor/`" carve-out explicitly excludes `swap/`.
- [ ] Commit Phase 5.

### Phase 6 — Split desync (TODO #2)

- [ ] Reproduce: edit a fragment (dirty), then invoke split; confirm whether split reads stale vault content and/or reports a false failure when the buffer is unsaved.
- [ ] Make split save-before-split: the split command saves the open fragment first (a no-op when clean), exactly as the Overview/Preview overlay "Done" saves-then-acts, so the vault matches the buffer before the split runs. Confirm this composes with the 2026-06-18 fix that already separated the split mutation from its best-effort invalidations.
- [ ] Tests: editing then splitting splits the edited content; no false "Split failed".
- [ ] Update `references/TODO.md` (item #2) and the `Shipped` frontmatter of `specifications/fragment-split.md`.
- [ ] Commit Phase 6.

### Phase 7 — Close out

- [ ] `bun run format` then `bun run verify`. Fix anything red.
- [ ] Set this plan `Status: Done`, add `Closed:`, and (on merge) `Merged: <sha>`.
- [ ] Update the `Shipped` frontmatter of the touched specs with the user-facing outcome (no granular tasks).

---

## Open questions

- Phase 2: heartbeat interval vs. event-driven (save-intent + blur) — which is enough? A heartbeat is simplest and most robust; settle on a cheap interval that cannot itself cause caret/buffer churn.
- Phase 3: should the "not backed up" warning also disable navigation away (a hard gate) or only warn? Leaning warn-only to avoid trapping the user, but the whole point is to prevent loss — decide with the developer.
- Phase 1: when a load genuinely cannot apply (malformed content/anchors), what is the safe end state — keep the prior buffer and warn, or refuse to mount? Must not present the user a blank/wrong buffer that reads as clean.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Focus areas: the change-chain backstop (Phase 2) and the crash-safe guards (Phase 1) are the load-bearing data-loss fixes — test them hardest. The swap-survival regression tests (Phase 5) guard a silent future regression and are cheap. Where practical, add a test that exercises the full "broken onChange → still saved/swapped/warned" path end to end.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
