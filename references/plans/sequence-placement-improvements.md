# Sequence placement improvements

**Date**: 13-06-2026
**Status**: Done
**Closed**: 13-06-2026
**Specs**: `specifications/sequencer.md`, `specifications/overview.md`

---

## Goal

> The "Place in sequence…" modal is an active-fragment-centric drag-and-drop arranger (a scoped reuse of the Overview's left column), import-sequences are read-only and cannot be mutated (enforced in the backend, not just hidden in the UI), and the choose-sequence picker lists member-sequences first with an "already in «section»" badge.

---

## Tasks

### Phase 0 — Branch & commit docs (do NOT create a new branch)

> We are already on branch `agent/sequence-changes` (a worktree). STAY on it. Do not create a new branch for this plan.

- [x] Commit the already-made documentation changes: `specifications/_glossary.md` (import-sequence → read-only), `references/adr/0014-placement-modal-becomes-active-fragment-arranger.md` (new), `references/adr/0006-placement-modal-separate-from-overview-arranger.md` (superseded note), and this plan file. Single doc commit before any code. _(2026-06-13 — commit `08be13b`)_

### Phase 1 — Import-sequences read-only (backend-first robustness)

> The core robustness fix. There is no `origin` guard today — import-sequences are fully mutable. Block mutation at the command/sequencer layer first, then reflect in the UI.

- [x] Add a sequencer-level guard helper (in `@maskor/sequencer`, pure) that decides whether a sequence is mutable based on its `origin` (origin-set ⇒ frozen placement/structure). _(2026-06-13 — `assertSequenceMutable` / `isSequenceReadOnly`)_
- [x] Enforce the guard in the mutating sequence commands under `packages/api/src/commands/sequences/`: `place-fragment`, `move-fragment`, `move-fragments`, `unplace-fragment`, `group-fragments`, `create-section`, `delete-section`, `rename-section`, `move-section`, `split-section`, `merge-section`. A blocked mutation fails cleanly (command failure surfaced to the user), not a silent no-op. _(2026-06-13 — guarded on the pure ops + the three section commands that bypass them)_
- [x] Decide & document the allowed set: clone, insert-into-another (as source), delete-whole-sequence, rename-sequence, active-toggle, designate-main remain allowed; only fragment placement and section structure are frozen. _(2026-06-13 — guard lives in `@maskor/sequencer`: `assertSequenceMutable` on the mutating pure functions + the section commands; `insertSequenceIntoSequence` guards the target only; `cloneSequence` ungated.)_
- [x] Placement picker: filter origin-set sequences out of `ctx.sequences` for the `fragment:place-in-sequence` command (`fragment-editor.tsx` → `placeableSequences`). _(2026-06-13)_
- [x] Tests: backend sequencer-level + route-level tests asserting each mutation is rejected (409 `sequence_read_only`) on an origin-set sequence and permitted on a normal one. _(2026-06-13)_
- [-] Overview read-only rendering (hide pool, disable DnD + section affordances) — _moved to Phase 2_: the `readOnly` prop belongs on the shared `ReorderList` being extracted there, so it is built once rather than plumbed now and reworked immediately. The backend guard already prevents any actual mutation (drag attempts 409 and roll back), so there is no correctness gap in the interim.
- [x] `git commit` (Phase 1: backend guard + picker filter). _(2026-06-13 — commit `6dbf360`)_

### Phase 2 — Lift the shared arranger column

> Extract the Overview's left column into a shared component so both Overview and the modal consume it. This is the bulk of the work; keep the Overview's behavior byte-for-byte unchanged.

- [x] Kept `ReorderList` + `useSequenceDnD` as the shared leaves (both surfaces already import them) and made `ReorderList`/`SectionGroup`/`ReorderRow` carry additive `showSectionControls` + `readOnly` flags, rather than lifting the whole page-coupled column. Lower regression risk; Overview's contract unchanged. _(2026-06-13)_
- [x] Built `SequenceArranger` (under `OverviewPage/components`) as the modal's self-contained consumer: derives sectionsData/pool/section-map, wires `useSequenceMutations` + `useSequenceDnD`, renders the DnD `ReorderList` with `showSectionControls={false}`, plus active-fragment quick actions + keyboard. _(2026-06-13)_
- [x] `readOnly` flag added; Overview applies it for import-sequences (origin set) — hides pool, disables both DnD contexts + section editing, shows a "clone to rearrange" banner. _(2026-06-13)_
- [x] Verified: full frontend suite (795 tests) + Overview suite (79) green after the change; writable-sequence behavior unchanged. _(2026-06-13)_
- [x] Tests: `ReorderList.test.tsx` (writable vs readOnly vs arranger-mode), `ReorderRow` disabled case. _(2026-06-13)_
- [x] `git commit` (Phases 2+3 together — the shared leaves and the modal consumer landed as one change). _(2026-06-13 — commit `4d10c51`)_

### Phase 3 — Rework the placement modal into the arranger (supersedes ADR 0006)

- [x] Replaced `PlaceInSequenceModal`'s button/keyboard body with the shared `SequenceArranger` (full DnD), scoped to the chosen sequence. Modal is now a thin shell. _(2026-06-13)_
- [x] Active fragment emphasized (selected highlight + scroll-into-view on open); quick add/move/remove footer retained; keyboard ←/→/Backspace kept alongside drag. _(2026-06-13)_
- [x] Reuses the Overview left-panel look (rows, section chrome, pool). Import-sequences are already filtered from the picker (Phase 1), so the modal is not reachable for them. _(2026-06-13)_
- [x] Old button-only step-move modal body removed; shared movement logic (`computeStepMoveTarget`) retained. _(2026-06-13)_
- [x] Tests: `PlaceInSequenceModal.test.tsx` rewritten — add/move/remove via footer, keyboard move, pool shown, no section management. _(2026-06-13)_
- [x] `git commit`. _(2026-06-13 — commit `4d10c51`, with Phase 2)_

### Phase 4 — Picker sorting + badge (TODO #1)

- [x] In the `fragment:place-in-sequence` picker, sort sequences the active fragment is already placed in to the top. _(2026-06-13)_
- [x] Append an "already in «section»" badge/suffix to those entries' labels via reusable `buildPlacementOptions` / `placementOptionLabel` (`lib/sequences/placementOptions.ts`). _(2026-06-13)_
- [x] Tests: `placementOptions.test.ts` (ordering + label, member/non-member/undefined cases). _(2026-06-13)_
- [x] `git commit`.

### Phase 5 — Spec updates & close-out

- [x] `specifications/sequencer.md`: two `Shipped:` entries (read-only import-sequence guard; arranger modal + picker sorting), frozen-mutation boundary documented, ADR 0014 referenced. _(2026-06-13)_
- [x] `specifications/overview.md`: `Shipped:` entry + "Sequence selection" note for read-only import-sequence rendering. _(2026-06-13)_
- [x] Ticked TODO.md items #1, #2, #3 (sequence placement). _(2026-06-13)_
- [x] Run `bun run format` then `bun run verify`; fix lint/test/codegen-drift before stopping. _(2026-06-13 — typecheck + verify:openapi + full backend/frontend suites green; repo-wide `format` eslint OOMs, so changed files were linted/formatted directly)_
- [x] `git commit`. _(2026-06-13 — review fixes in commit `de61615`)_

### Phase 6 — Placement-modal UX follow-up (post-review feedback, 2026-06-13)

> Feedback after using the arranger: drag ghost was offset, the long pool was awkward below the sections, keyboard arrows felt wrong, and focus was lost when a fragment changed section.

- [x] Drag overlay portaled to `document.body` — the modal centers via a CSS transform, which made the `position: fixed` overlay drift from the cursor. _(2026-06-13)_
- [x] Pool moved beside the sections (`ReorderList` `layout="split"`, each column independently scrollable) so dragging a pool fragment up no longer means scrolling a long stacked list. _(2026-06-13)_
- [x] Keyboard sort switched from ←/→ to ↑/↓ (vertical list); `j`/`k` added in vim mode (`useProjectEditorConfig`). Footer buttons relabelled "Move up"/"Move down". _(2026-06-13)_
- [x] Keyboard focus restored to the active row after a cross-section move/remove (the row unmounts and remounts, dropping DOM focus and breaking subsequent keystrokes). _(2026-06-13)_
- [x] Tests: `ReorderList.test.tsx` split-layout case; `PlaceInSequenceModal.test.tsx` up-arrow + vim `k` (on/off). _(2026-06-13)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Critical coverage: backend rejection of every mutating command on an origin-set sequence (Phase 1) — this is the robustness guarantee and must not be frontend-only. Plus Overview regression after the Phase 2 extraction, and the modal's active-fragment emphasis + commit parity in Phase 3.

## Notes

We are ALREADY on a non-main branch (`agent/sequence-changes`) in a worktree. DO NOT create a new branch for this plan — stay on the current branch. (This overrides the template's default "create a new branch" guidance.)

ADRs are already written: ADR 0014 supersedes ADR 0006. Glossary already updated (import-sequence is read-only). Phase 0's first action is committing those doc changes.

If implementation reveals that making only the active fragment draggable (rather than all rows) is cleanly feasible during the Phase 2 extraction, raise it — it would partially restore ADR 0006's "active-only" intent. Otherwise, the all-rows-draggable arranger per ADR 0014 stands.

DO NOT IMPLEMENT until clearly stated by the developer.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`, and update the relevant specs' `Shipped:` frontmatter with the features implemented (no implementation details or granular tasks).
