# Place in sequence

**Date**: 31-05-2026
**Status**: Todo
**Specs**: `specifications/sequencer.md`, `specifications/command-palette.md`

---

## Goal

> From the fragment editor (FragmentListPage or SuggestionModePage), the user can run a **"Place in sequence…"** command, pick a sequence by name, and in a keyboard/button-driven modal add the active fragment to a section, move it across positions/sections, remove it, and add/remove sections — each action committed live — for that one sequence, without touching the Overview.

Done = the command appears in the palette in both pages (disabled when the active fragment is discarded), opens the placement modal for the chosen sequence, and every add/move/remove/section action persists immediately and is reflected in the Overview.

Design rationale recorded in `references/adr/0006-placement-modal-separate-from-overview-arranger.md`.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `place-in-sequence` from current base.

### Phase 1 — Extract shared movement + tile presentation

> No behavior change to the Overview. Pure extraction so the modal and Overview share one movement implementation and one tile.

- [ ] Lift the active-fragment step-move logic out of `OverviewPage` (`handleFragmentKeyboardMove`) into a shared pure helper (e.g. `lib/sequences/`) that, given `sectionsData` + a fragment UUID + direction, returns the target `{ sectionUuid, position }` (or `null` at the ends). Overview calls it; the modal calls it.
- [ ] Make `TileContent`'s `cursor-grab`/`active:cursor-grabbing` conditional (e.g. a `draggable`/`interactive` prop) so a non-DnD context does not imply draggability. Overview passes the drag-on variant; modal passes drag-off.
- [ ] Confirm Overview still behaves identically (existing Overview tests pass; arrow-move unchanged).

### Phase 2 — Place-in-sequence modal component

- [ ] New `PlaceInSequenceModal` (Radix Dialog) taking `projectId`, `fragmentId`, `sequenceId`, `open`, `onOpenChange`.
- [ ] Load the sequence bundle (`useListSequences`) and fragment summaries; derive this sequence's `sectionsData` and the active fragment's current state (placed-in-section vs unplaced/pool). Reuse the Overview's section/pool derivation shape.
- [ ] Render sections (section-aware): each section shows its fragments as `TileContent` at `compact` density, drag-off. The **active fragment** is highlighted; all other tiles are read-only context.
- [ ] **Add** (active fragment unplaced): a section selector (collapses to nothing when the sequence has one section) + an "Add" action that appends the active fragment to the selected section's end via `usePlaceFragment`, then leaves it selected for arrow-positioning.
- [ ] **Move** (active fragment placed): left/right arrow keys call the shared step-move helper → `useMoveFragment`. Buttons mirror the arrows for discoverability.
- [ ] **Remove** (active fragment placed): button + `Backspace`/`Delete` → `useUnplaceFragment` (fragment returns to pool; modal stays open).
- [ ] **Section add/remove**: buttons calling `useCreateSection` / `useDeleteSection`. Respect the existing last-section-undeletable guard (surface the 4xx as a disabled/blocked state, no crash). Removing a section that holds the active fragment sends it to the pool (inherited `deleteSection` behavior) — modal reflects the new unplaced state.
- [ ] Live commit throughout: every action fires its mutation immediately and re-renders from the returned bundle. No Save/Cancel; closing only closes. Invalidate the sequences list query key so the Overview stays consistent.

### Phase 3 — Command + scope wiring

- [ ] Extend `FragmentEditorContext` (`lib/commands/scopes/fragment-editor.ts`) with what the command needs: `projectId`, `fragmentId`, `isDiscarded` (already present), a list of sequences (or a thunk to fetch for the arg picker), and an `openPlaceInSequence(sequenceId)` primitive.
- [ ] Add `defineScopeCommand` `fragment:place-in-sequence` ("Place in sequence…", category `other`): parameterized `arg` (flat-items shape) whose `items` are the project's sequences and `getLabel` is the sequence name; `run(ctx, sequence)` calls `ctx.openPlaceInSequence(sequence.uuid)`. `disabled` when `!hasFragment` or `isDiscarded`.
- [ ] Export it from `fragmentEditorCommands` (already spread in `scopes/index.ts`).
- [ ] In `FragmentEditor`: load sequences for the arg picker, own the modal open-state (`sequenceId | null`), publish the new context fields, and render `<PlaceInSequenceModal>`. The component is mounted in both FragmentListPage (route Outlet) and SuggestionModePage, so the command is available in both for free.
- [ ] Zero-sequence case: parameterized command with no items shows disabled-with-explanation per the palette spec (no special code).

### Phase 4 — Verify + document

- [ ] `bun run format` then `bun run verify`. Fix lint/test/snapshot drift. (No API/route change here — endpoints already exist; codegen only if a query/mutation hook is missing.)
- [ ] Update `specifications/sequencer.md` `Shipped` with a one-line entry for the place-in-sequence flow.
- [ ] Final `git commit` for the phase (commit per phase as work lands).

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
