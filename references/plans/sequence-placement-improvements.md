# Sequence placement improvements

**Date**: 13-06-2026
**Status**: Todo
**Specs**: `specifications/sequencer.md`, `specifications/overview.md`

---

## Goal

> The "Place in sequence…" modal is an active-fragment-centric drag-and-drop arranger (a scoped reuse of the Overview's left column), import-sequences are read-only and cannot be mutated (enforced in the backend, not just hidden in the UI), and the choose-sequence picker lists member-sequences first with an "already in «section»" badge.

---

## Tasks

### Phase 0 — Branch & commit docs (do NOT create a new branch)

> We are already on branch `agent/sequence-changes` (a worktree). STAY on it. Do not create a new branch for this plan.

- [ ] Commit the already-made documentation changes: `specifications/_glossary.md` (import-sequence → read-only), `references/adr/0014-placement-modal-becomes-active-fragment-arranger.md` (new), `references/adr/0006-placement-modal-separate-from-overview-arranger.md` (superseded note), and this plan file. Single doc commit before any code.

### Phase 1 — Import-sequences read-only (backend-first robustness)

> The core robustness fix. There is no `origin` guard today — import-sequences are fully mutable. Block mutation at the command/sequencer layer first, then reflect in the UI.

- [ ] Add a sequencer-level guard helper (in `@maskor/sequencer`, pure) that decides whether a sequence is mutable based on its `origin` (origin-set ⇒ frozen placement/structure).
- [ ] Enforce the guard in the mutating sequence commands under `packages/api/src/commands/sequences/`: `place-fragment`, `move-fragment`, `move-fragments`, `unplace-fragment`, `group-fragments`, `create-section`, `delete-section`, `rename-section`, `move-section`, `split-section`, `merge-section`. A blocked mutation fails cleanly (command failure surfaced to the user), not a silent no-op.
- [x] Decide & document the allowed set: clone, insert-into-another (as source), delete-whole-sequence, rename-sequence, active-toggle, designate-main remain allowed; only fragment placement and section structure are frozen. _(2026-06-13 — guard lives in `@maskor/sequencer`: `assertSequenceMutable` on the mutating pure functions + the section commands; `insertSequenceIntoSequence` guards the target only; `cloneSequence` ungated.)_
- [x] Placement picker: filter origin-set sequences out of `ctx.sequences` for the `fragment:place-in-sequence` command (`fragment-editor.tsx` → `placeableSequences`). _(2026-06-13)_
- [x] Tests: backend sequencer-level + route-level tests asserting each mutation is rejected (409 `sequence_read_only`) on an origin-set sequence and permitted on a normal one. _(2026-06-13)_
- [-] Overview read-only rendering (hide pool, disable DnD + section affordances) — _moved to Phase 2_: the `readOnly` prop belongs on the shared `ReorderList` being extracted there, so it is built once rather than plumbed now and reworked immediately. The backend guard already prevents any actual mutation (drag attempts 409 and roll back), so there is no correctness gap in the interim.
- [ ] `git commit` (Phase 1: backend guard + picker filter).

### Phase 2 — Lift the shared arranger column

> Extract the Overview's left column into a shared component so both Overview and the modal consume it. This is the bulk of the work; keep the Overview's behavior byte-for-byte unchanged.

- [ ] Extract `ReorderList` + its `useSequenceDnD` wiring (currently page-coupled in `OverviewPage`, ~20 section-editing props) into a shared, self-contained component with a narrowed prop surface. Keep `handleFragmentKeyboardMove` / `computeStepMoveTarget` shared.
- [ ] Parameterize for two consumers: full Overview (all sections, pool, section editing) and modal (single sequence, active-fragment emphasis). The shared component must not assume page-level context.
- [ ] Add a `readOnly` prop to the extracted component: hides the unassigned pool, the "+ Add section" affordance, and disables drag + per-section rename/delete/merge/split. Apply it in the Overview when the selected sequence is an import-sequence (origin set), with a clear "clone to edit" affordance. (Folded in from Phase 1.)
- [ ] Verify Overview is visually and behaviorally unchanged after the extraction for writable sequences (regression check before the modal consumes it).
- [ ] Tests: existing Overview DnD/section tests still pass against the extracted component; add a focused test for the extracted component in isolation, including the read-only rendering for an import-sequence.
- [ ] `git commit`.

### Phase 3 — Rework the placement modal into the arranger (supersedes ADR 0006)

- [ ] Replace `PlaceInSequenceModal`'s button/keyboard body with the shared arranger column scoped to the chosen sequence, with full DnD.
- [ ] Emphasize the active fragment: highlight it, scroll it into view on open, and retain quick add/move/remove-active affordances. Keep keyboard moves working alongside drag.
- [ ] Reuse the Overview left-panel look (rows, section chrome, pool). Resolve the read-only case: a modal opened for an import-sequence (if reachable at all post-Phase-1 filtering) is non-interactive.
- [ ] Remove now-dead code paths from the old modal (button-only step-move UI) where superseded; keep shared movement logic.
- [ ] Tests: modal renders the arranger, active fragment is emphasized, drag/keyboard move and add/remove commit against the same endpoints, import-sequence path is read-only.
- [ ] `git commit`.

### Phase 4 — Picker sorting + badge (TODO #1)

- [ ] In the `fragment:place-in-sequence` picker, sort sequences the active fragment is already placed in to the top.
- [ ] Append an "already in «section»" badge/suffix to those entries' labels (reuse the membership derivation already in `fragment-sequence-membership.tsx`).
- [ ] Tests: picker ordering + badge for a fragment with/without existing memberships.
- [ ] `git commit`.

### Phase 5 — Spec updates & close-out

- [ ] `specifications/sequencer.md`: add a `Shipped:` entry for the read-only import-sequence guard and the modal redesign; document the frozen-mutation boundary in the body. Reference ADR 0014.
- [ ] `specifications/overview.md`: update if the read-only import-sequence rendering or the shared-column extraction changes anything the spec asserts. Confirm before editing; if no behavioral claim changes, note that and skip.
- [ ] Tick TODO.md items #1, #2, #3 (sequence placement) as done.
- [ ] Run `bun run format` then `bun run verify`; fix lint/test/codegen-drift before stopping.
- [ ] `git commit`.

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
