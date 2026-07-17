# Cross-surface highlight on sequence hover

**Date**: 17-07-2026
**Status**: Done
**Specs**: `specifications/overview.md`
**Closed**: 17-07-2026

---

## Goal

> Hovering a non-active sequence's row in the left sequence sidebar highlights that sequence's member fragments everywhere they appear in the currently active sequence's surfaces — the reorder left column (placed rows), the prose spine, and the plotted dots in both the aspect-arc and length graphs — with a highlight that is visually distinct from selection and coexists with it. Moving the pointer off the row clears the highlight. Hovering the active sequence's own row highlights nothing. Purely client-side, no API change.

---

## Context

The sequence list (`SequenceSidebar` → `SequenceRow`) sits at the far left. To its right, three surfaces all render the **active** sequence's fragments:

- The reorder column — `ReorderList` → `SectionGroup` → `ReorderRow` (placed rows) plus a pool block (unplaced rows).
- The prose spine — `ProseSpine` → `SortableSpineFragment` → `FragmentProse`.
- The two graphs — `ArcOverlay` and `LengthOverlay`, both rendering their dots through the shared `ArcPanel` (each `ArcPoint` already carries its `fragmentUuid`).

All three live in `OverviewPage` (`index.tsx`), which already holds `bundle.sequences`, `activeSequenceId`, `sectionsData`, and a selection set. `SequenceSidebar` is also mounted from `index.tsx` and receives `sequences` + `activeSequenceId`.

Because the three surfaces only ever render the active sequence's fragments, the "present in the active sequence" intersection is implicit: passing down the **hovered sequence's** fragment-uuid set and highlighting any rendered fragment that is a member yields exactly the intended result. Pool rows in the reorder column are *not* placed in the active sequence, so they are excluded from highlighting.

**Selection vs. highlight.** Both `ReorderRow` and `FragmentProse` mark selection with `border-primary bg-primary/5`. The hover-highlight is a separate, transient signal and must (a) read as clearly different from selection and (b) coexist with it (a fragment can be both selected and highlighted). A ring is the natural non-conflicting layer since selection owns the border/background. Amber is already taken (inactive-constraint marker) and `bg-accent` marks the active row — the highlight treatment should avoid colliding with those. Exact treatment is the one open design decision (see below).

Decisions already settled with the developer: **hover source is non-active sequence rows only**; the feature is **advisory visual only** (no scoring, no persistence); **client-side**, reusing existing data.

**Open decision — highlight treatment.** Proposed default: a ring (e.g. a ~2px ring in a distinct hue at moderate opacity) on the reorder rows and spine entries, and an enlarged dot with a matching ring/halo on the graph points. To be confirmed at review or during implementation; it must satisfy the distinct-from-and-coexists-with-selection constraint above and work in light and dark themes.

---

## Tasks

### Phase 1 — Hover source + derived highlight set

- [x] Create branch `agent/sequence-hover-highlight`.
- [x] Add `onHoverStart(sequenceUuid)` / `onHoverEnd()` (or a single `onHoverSequence(uuid | null)`) callbacks to `SequenceRow`, fired from the row's `onMouseEnter` / `onMouseLeave` (and cleared on unmount/leave). Thread them through `SequenceSidebar`.
- [x] Lift `hoveredSequenceId` state into `OverviewPage`; pass the hover callback into `SequenceSidebar`.
- [x] Derive `highlightedFragmentUuids: Set<string>` in `OverviewPage`: the hovered sequence's fragment uuids (flattened across its sections), memoized; empty when nothing is hovered or when the hovered sequence is the active one. Add a small reusable helper for "a sequence's fragment-uuid set" if one does not already exist, and unit-test it (including the active-hover → empty case).

### Phase 2 — Apply the highlight across surfaces

- [x] Reorder column: thread a highlight predicate/set through `ReorderList` → `SectionGroup` → `ReorderRow`; apply the highlight style to placed rows whose uuid is in the set. Leave pool rows unhighlighted. Keep it composable with the existing `isSelected` style.
- [x] Prose spine: thread it through `ProseSpine` → `SortableSpineFragment` → `FragmentProse`; add an `isHighlighted` style that coexists with `isSelected`.
- [x] Graph dots: add an optional `highlightedFragmentUuids` prop to `ArcPanel`; emphasize points whose `fragmentUuid` is a member (enlarged dot + ring/halo). Pass it from both `ArcOverlay` and `LengthOverlay` (threaded from `OverviewPage`).
- [x] Confirm/settle the highlight visual treatment (the open decision above) and apply it consistently across all three surfaces.

### Phase 3 — Tests, spec, verify

- [x] Component tests: `ReorderRow` / `FragmentProse` apply the highlight class when flagged and still show selection when both are set; `ArcPanel` emphasizes highlighted points; `SequenceRow` fires the hover callbacks; an `OverviewPage` integration test that hovering a non-active sequence row highlights a shared fragment in at least one surface and clears on leave.
- [x] Add a `Shipped` entry to `specifications/overview.md` (advisory cross-surface hover highlight; where it appears; non-active-only). No implementation detail.
- [x] `bun run format` then `bun run verify`; fix any failures.
- [x] Commit each phase (or a sensible batch) with `git commit`.

---

## Out of scope

- Any persistence, scoring, or constraint effect — this is a transient visual only.
- Highlighting in the placement modal (`SequenceArranger`), the right detail panel, or the vertical arc strip.
- Highlighting pool / unplaced rows, or fragments not placed in the active sequence.
- A click-to-pin variant of the highlight (hover only for this slice).
- Any backend, API, or schema change.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specifically: the fragment-uuid-set derivation (including the active-hover → empty case), the per-surface highlight rendering (coexisting with selection), the `ArcPanel` dot emphasis, and the `SequenceRow` hover callbacks, plus one `OverviewPage` integration pass.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
