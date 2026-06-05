# Overview redesign — vertical read/reorder surface with arc overlay

**Date**: 05-06-2026
**Status**: In Progress
**Specs**: `specifications/sequencer.md`, `specifications/aspect-arc-model.md`, `specifications/_glossary.md`

---

## Goal

> Replace the horizontal tile Overview with a vertical working surface: a fragment spine readable as flowing prose (collapsible to title rows), a left reorder list + condensed unassigned pool, a right selected-fragment detail panel, and a summonable horizontal aspect-arc overlay that expands to a full zoomable view. Reordering is optimistic and commits to the backend immediately. Preview is left unchanged as the export-authoritative renderer.

Decisions are recorded in `references/adr/0010-overview-vertical-read-reorder-surface-with-arc-overlay.md` and `references/adr/0011-overview-prose-rendered-client-side-per-fragment.md`. The glossary `Overview`/`Tile` entries are already updated.

---

## Tasks

### Phase 1 — Vertical working surface (core)

- [x] Verify that you are in branch `agent/overview-redesign`. STOP IMMEDIATELY if not.
- [x] Commit documentation and spec changes so that the working directory is clean.
- [x] **Backend: per-fragment bulk-content endpoint.** Add a sequence-scoped route returning the sequence as an ordered list of `{ fragmentUuid, key, content }` (placed fragments, in sequence order) plus the unassigned-pool fragments' content. Define request/response schemas in `packages/api`, regenerate the OpenAPI snapshot, then `bun run codegen` so the orval hook exists. (`packages/api/src/routes/sequences.ts` or a new `preview`-adjacent route; mirror existing list-endpoint shape.)
- [x] **Shared per-fragment renderer component.** A single component that renders one fragment's markdown body (read mode), used by both the prose spine and the right panel. Reuse `PreviewProse`'s markdown rendering where possible but scoped to a single fragment chunk; expose a stable per-fragment anchor id for navigation. Edit affordance is stubbed/absent (Phase 4).
- [x] **Vertical layout shell.** Rework `OverviewPage/index.tsx` into a three-column layout: left reorder list + pool, main prose spine, right selected-fragment detail. Remove the horizontal scroller + sticky arc panel arrangement.
- [x] **Level-of-detail axis for the spine.** Replace the tile `density` (full/compact/mini) with a spine detail axis: prose → title+excerpt → title-only. Persist per-project like today's density (`project.overview.density` → re-purpose or add field; update router search param + `useUpdateProject`). Confirm the chosen field naming with the existing `OverviewDensity` type in `router.ts`.
- [x] **Left reorder list + condensed pool.** Compact vertical title list of placed fragments grouped by section, with the unassigned pool as a distinct region. Selecting a row sets the selected fragment; dragging reorders within/between sections and places/unplaces against the pool. Reuse `useSequenceDnD` logic, re-targeted from horizontal tile DnD to vertical list DnD.
- [x] **Right selected-fragment detail.** Reuse `RightSidebar`/`FragmentDetail`; ensure it renders for both placed and pool fragments. Optionally surface fuller content via the new bulk endpoint instead of only the summary excerpt.
- [x] **Optimistic reorder commit.** Wire list reorder + place/unplace through `overviewScope` commands and `useSequenceMutations`, keeping the existing optimistic-update + rollback pattern. No direct `useMutation` in components.
- [x] **Arc overlay (reuse ArcPanel).** Summonable compressed horizontal multi-aspect graph rendered from `ArcPanel`/`useArcData`, with x-axis re-mapped from sequence index / fit-to-width (not tile centers from `computeSequenceLayout`). Add a minimized sections bar beneath the graph showing section boundaries. Provide expand control → full zoomable/scrollable arc view (same component, larger).
- [x] **Retire tile machinery.** Remove or repurpose `TileContent`, `SortableTile`, `PoolZone`, `SequenceSections`, `SectionZone`, and the horizontal `computeSequenceLayout`/`TILE_DIMENSIONS_BY_DENSITY` once superseded. Keep `AspectColorBar`/`aspectColors`/`useArcData` (arc reuse).
- [x] Update `overviewScope` command set for the new surface (detail-axis toggle, arc overlay summon/expand, reorder/place/unplace) and keep barrel imports in `scopes/index.ts` current.
- [x] Tests: bulk endpoint (ordered content + pool), vertical DnD reorder/place/unplace, optimistic rollback on error, arc overlay x-mapping from sequence index, detail-axis rendering.
- [x] `bun run format`, then `bun run verify`; fix lint/test/codegen-sync issues
- [x] Update `Shipped` in `specifications/sequencer.md` (and `aspect-arc-model.md` for the arc overlay); `git commit`

### Phase 1b — Vertical arc strip

- [x] **Inline vertical arc strip** beside the spine: a thin per-aspect glance strip aligned to fragment rows (sequence position = vertical, weight = horizontal deviation). New rendering (not ArcPanel reuse). Toggle + respect aspect visibility from `ArcLegend`.
- [x] Tests for the strip's row-alignment and aspect toggling
- [x] `bun run format` + `bun run verify`; update spec `Shipped`; `git commit`

### Phase 2 — Multi-select → section / split

- [ ] **Sequencer-side ops** (`@maskor/sequencer` + API), not frontend-only: group a selected set of fragments into a new section; drag many fragments into an existing section; split a sequence at a marked point by inserting a new section boundary. Define API routes + schemas, `bun run codegen`.
- [ ] Frontend multi-select on the reorder list + commands for group/split via `overviewScope`
- [ ] Tests for the sequencer ops (ordering correctness, robustness) and the frontend selection/commands
- [ ] `bun run format` + `bun run verify`; update spec `Shipped`; `git commit`

### Phase 3 — Clone / merge sequences

- [ ] **Clone a sequence** and **insert one sequence into another** (at a position): backend ops + schemas, `bun run codegen`
- [ ] Frontend affordances in the sequence sidebar + `overviewScope`/global commands
- [ ] Tests for clone/merge semantics (section + position integrity, no UUID collisions)
- [ ] `bun run format` + `bun run verify`; update spec `Shipped`; `git commit`

### Phase 4 — In-context fragment editing

- [ ] **Select-to-edit on the shared per-fragment renderer.** Enable selecting text in a rendered fragment (spine or right panel) and entering a simple editor for that fragment; save via the existing fragment update path. Each chunk maps the edit back to its `fragmentUuid`.
- [ ] Tests for edit-from-context save round-trip and selection→fragment mapping
- [ ] `bun run format` + `bun run verify`; update spec `Shipped` (and `vision.md`/editor specs if relevant); `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key risk areas to cover: optimistic reorder + rollback parity with `useSequenceMutations`; arc overlay x-axis re-mapping from sequence index (regression vs. tile-center mapping); bulk-content endpoint ordering and pool inclusion; vertical DnD place/unplace boundaries.

## Notes

Accepted rendering drift: the working-surface prose is client-rendered per-fragment with a plain fixed style and is **not** promised to match Preview/export (ADR 0011). Preview remains the export proof.

Honor project conventions: command system (no direct `useMutation` in components — dispatch via `overviewScope`), generated orval client (`bun run codegen` after any route change), reuse existing optimistic patterns, match existing style, no abbreviated variable names.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
