# Place in sequence

**Date**: 31-05-2026
**Status**: Done
**Specs**: `specifications/sequencer.md`, `specifications/command-palette.md`
**Closed**: 01-06-2026

---

## Goal

> From the fragment editor (FragmentListPage or SuggestionModePage), the user can run a **"Place in sequence…"** command, pick a sequence by name, and in a keyboard/button-driven modal add the active fragment to a section, move it across positions/sections, remove it, and add/remove sections — each action committed live — for that one sequence, without touching the Overview.

Done = the command appears in the palette in both pages (disabled when the active fragment is discarded), opens the placement modal for the chosen sequence, and every add/move/remove/section action persists immediately and is reflected in the Overview.

Design rationale recorded in `references/adr/0006-placement-modal-separate-from-overview-arranger.md`.

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `place-in-sequence` from current base. _(2026-06-01)_

### Phase 1 — Extract shared movement + tile presentation

> No behavior change to the Overview. Pure extraction so the modal and Overview share one movement implementation and one tile.

- [x] Lift the active-fragment step-move logic out of `OverviewPage` (`handleFragmentKeyboardMove`) into a shared pure helper (`lib/sequences/stepMove.ts` — `computeStepMoveTarget`). Overview and modal both call it. _(2026-06-01)_
- [x] Make `TileContent`'s `cursor-grab`/`active:cursor-grabbing` conditional via a `draggable` prop (default true). Overview keeps drag-on; modal passes drag-off. _(2026-06-01)_
- [x] Confirm Overview still behaves identically (existing Overview tests pass; arrow-move unchanged). _(2026-06-01)_

### Phase 2 — Place-in-sequence modal component

- [x] New `PlaceInSequenceModal` (Radix Dialog) taking `projectId`, `fragmentId`, `sequenceId`, `open`, `onOpenChange`. _(2026-06-01)_
- [x] Load the sequence bundle (`useListSequences`) and fragment summaries; derive `sectionsData` and the active fragment's placed/unplaced state. _(2026-06-01)_
- [x] Render sections (section-aware): each section shows its fragments as `TileContent` at `compact` density, drag-off. The **active fragment** is highlighted; all other tiles are read-only context. _(2026-06-01)_
- [x] **Add** (active fragment unplaced): section selector (collapses to nothing for single-section sequences) + "Add to sequence" appends to the selected section's end via `usePlaceFragment`. _(2026-06-01)_
- [x] **Move** (active fragment placed): left/right arrow keys + buttons call the shared helper → `useMoveFragment`. _(2026-06-01)_
- [x] **Remove** (active fragment placed): button + `Backspace`/`Delete` → `useUnplaceFragment`. _(2026-06-01)_
- [x] **Section add/remove**: `useCreateSection` / `useDeleteSection`; delete disabled when one section remains (last-section guard). _(2026-06-01)_
- [x] Live commit throughout; close only closes. Invalidate the sequences list query key (via `useSequenceMutations` + section hooks) so the Overview stays consistent. _(2026-06-01)_

### Phase 3 — Command + scope wiring

- [x] Extend `FragmentEditorContext` with `sequences` and `openPlaceInSequence(sequenceId)`. (`projectId`/`fragmentId` not needed in context — the modal reads them from `FragmentEditor`'s own props.) _(2026-06-01)_
- [x] Add `fragment:place-in-sequence` ("Place in sequence…", category `other`): parameterized flat-items `arg` over the project's sequences; `run` opens the modal. `disabled` when no fragment, discarded, or no sequences. _(2026-06-01)_
- [x] Exported from `fragmentEditorCommands`. _(2026-06-01)_
- [x] `FragmentEditor` loads sequences, owns modal open-state, publishes context, renders `<PlaceInSequenceModal>` — available in both list and suggestion-mode views. _(2026-06-01)_
- [x] Zero-sequence case: explicit `disabled` "No sequences" reason. _(2026-06-01)_

### Phase 4 — Verify + document

- [x] `bun run format` then `bun run verify` — full backend + frontend suites green, no OpenAPI drift. _(2026-06-01)_
- [x] Update `specifications/sequencer.md` `Shipped`. _(2026-06-01)_
- [x] Commit per phase. _(2026-06-01)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Shared step-move helper: unit tests for within-section, cross-section-boundary, and end-of-sequence (no-op) cases.
- Modal: add appends to selected section; move steps across boundaries; remove unplaces; section add/remove (incl. blocked last-section delete and active-fragment-in-deleted-section → pool). Wrap with `<CommandsProvider>` where a scope is exercised.
- Command: present and enabled in the fragment-editor scope; disabled when the active fragment is discarded; selecting a sequence opens the modal for that sequence.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`, and update the relevant spec frontmatter (`Shipped`) without implementation detail.

Constraint from ADR 0006: the modal reuses **only** presentational pieces (`TileContent`, section chrome) and the shared step-move helper — it must **not** import or reuse `useSequenceDnD` / `SortableTile`.
