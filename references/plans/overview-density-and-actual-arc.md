# Overview — density tiers and actual-arc panel

**Date**: 19-05-2026
**Status**: Done
**Closed**: 19-05-2026
**Specs**: `specifications/overview.md`, `specifications/aspect-arc-model.md`

---

## Goal

A user opening the overview can switch between three density tiers (full / compact / mini) that shrink the tile content and tile width progressively, see a sticky arc panel above the tile row drawing one smoothed continuous curve per aspect (the **actual arc** — derived from the placed fragments' aspect weights and positions) with per-aspect toggles, and continue to drag fragments between sections and the pool at every density tier without the arc panel breaking, jittering, or losing alignment with the tiles below it. Explicit arcs are not part of this slice.

> Out of this slice (already deferred or blocked): explicit arcs (need an arc API endpoint), DOM virtualization, minimap, user-configurable curve interpolation, heatmap variants, and section-reordering UI.

---

## Scope decisions captured here

These resolve open questions from the design session and from `overview.md`:

- **Renderer is HTML + SVG, not canvas.** The existing prior decision in `overview.md` ("HTML/CSS over canvas") is reframed, not reversed. SVG is essential for the arc layer. Tiles stay in the DOM at every density tier. `@dnd-kit` setup stays. Spec edit queued in § Spec changes.
- **The "preserve link following" rationale in the existing prior decision is dead in practice.** `packages/frontend/src/pages/OverviewPage/components/TileContent.tsx:71-73` renders `fragment.excerpt` as a plain string — no markdown, no rendered links. Text selection + a11y are the rationales that remain live; both survive HTML+SVG. Spec wording will be tightened accordingly.
- **Density tier state lives in the URL search param** (`?density=full|compact|mini`), consistent with the existing `?sequence=` param on `/projects/$projectId/overview`. Stateless, reload-safe, shareable. Default when absent: `full`.
- **Per-aspect arc toggles are session-scoped** (component state, not URL, not vault). The set of visible aspects is a transient viewing preference; persisting it across sessions is unwarranted in v1. All aspects default to on each visit.
- **The arc panel is sticky to the top of the scrollable sequence area**, not the page. Horizontal scroll moves the tile row under the curve; the curve translates with the tiles (shared x-axis), not with the viewport. The sticky behavior is vertical only.
- **Arc curve is computed client-side** from `FragmentSummary.aspectWeights` (already returned by `useListFragmentSummaries`) and the fragment's index within the sequence. No new API endpoint required for this slice. Recomputation runs on placement/move/unplace and is debounced during active drag.
- **Continuous across section boundaries.** The arc is plotted against the fragment's absolute index in the whole sequence, not its intra-section index. Sections are visual markers on the tile row only.
- **Smoothed curve interpolation** uses a Catmull-Rom / cardinal spline. Hard-coded for v1; the user-configurable curve type is deferred.
- **Color per aspect** comes from the existing aspect color metadata. If an aspect has no defined color, the arc layer assigns a stable fallback from a project-scoped palette (deterministic on aspect key). Worth confirming this exists before phase 3; flagged as a verification step.

---

## Tasks

### Phase 1 — Branch, URL state, and density toggle UI

- [x] Create branch `overview-density-and-actual-arc` from `main`.
- [x] Add `density` search-param schema to the `/projects/$projectId/overview` route. Default `full`. Enum: `full | compact | mini`.
- [x] Add a density toggle control in the overview header (segmented control, three buttons). Updates the URL search param via `useNavigate`.
- [x] Read `density` from `useSearch` in `OverviewPage` and thread it to the tile rendering layer.
- [x] Tests: route param validation, toggle interaction updates the URL, default falls back to `full`.
- [x] `git commit` — add density tier URL state and header toggle.

### Phase 2 — Per-tier tile content and width

> Tile content matrix:
> - `full`: key + excerpt + aspect chips (current behavior).
> - `compact`: key + thin aspect color bar (no excerpt).
> - `mini`: aspect color bar only (no text).
>
> Tile width also shrinks per tier (concrete pixel values decided during implementation; the existing `w-40 h-28` is the `full` baseline).

- [x] Refactor `TileContent.tsx` to accept a `density` prop and switch its layout / sizing accordingly.
- [x] Render an "aspect color bar" sub-component that paints stacked color segments proportional to each aspect's weight on the fragment. Used by both `compact` and `mini`.
- [x] Confirm the bar uses the same aspect color source the arc panel will use in phase 3 (single source of truth).
- [x] Update `SortableTile.tsx` to pass the `density` prop through.
- [x] Verify `@dnd-kit` drag overlays look correct at each density (the `DragOverlay` in `OverviewPage/index.tsx` renders `TileContent` directly — it needs the same `density` prop).
- [x] Tests: snapshot or DOM tests for each density tier, ensuring the right fields are rendered at each.
- [x] `git commit` — render tiles per density tier with aspect color bar.

### Phase 3 — Sticky arc panel with actual arc

- [x] Add a `ArcPanel` component under `packages/frontend/src/pages/OverviewPage/components/`. Renders a single inline SVG whose width tracks the tile row's content width. Sticky at the top of the scrollable area via `position: sticky; top: 0;`.
- [x] Implement an arc-data hook that derives, per aspect, a list of `(x = absolute fragment index, y = aspect weight)` points from the current sequence + summaries. Fragments with no weight for that aspect contribute no point (consistent with `aspect-arc-model.md` § "Fragments with no weight for an arc'd aspect are ignored in scoring").
- [x] Interpolate each aspect's points into a smoothed SVG path (Catmull-Rom). Two control-point minimum; aspects with one point render as a single dot, zero points render nothing.
- [x] x-axis: align each point to the horizontal center of its tile. The tile row and the arc share the same parent's scroll, so the curve and tiles stay aligned during scroll.
- [x] Debounce arc recomputation during active `@dnd-kit` drag (use `activeDragId` from the existing state as the gate). Recompute immediately on `onDragEnd`.
- [x] Verify aspect color metadata is available client-side; wire it in. If the data model doesn't expose colors yet, this phase pauses and a follow-up captures the gap.
- [x] Tests: arc path generation given a small fixture sequence; correct point alignment to tile centers; the panel does not render points for fragments with missing aspect weights.
- [x] `git commit` — add sticky arc panel rendering the actual arc.

### Phase 4 — Multi-aspect legend and toggles

- [x] Render a legend inside (or adjacent to) the arc panel showing each aspect with its color and a toggle.
- [x] Toggling an aspect hides its curve in the SVG. State is component-local.
- [x] When zero aspects are toggled on, the SVG renders an empty axis area but does not collapse — the panel's reserved height stays stable to avoid layout shift on toggling.
- [x] Tests: toggle hides the corresponding `<path>` from the SVG; the panel's container height does not change when all aspects are off.
- [x] `git commit` — add per-aspect legend and toggle controls.

### Phase 5 — Spec sync and plan close-out

> See § Spec changes below for the exact edits queued.

- [x] Apply the queued edits to `specifications/overview.md`.
- [x] Add the `Shipped:` line under `overview.md`'s frontmatter for this slice.
- [x] Plan status flipped to `Done`, `Closed: DD-MM-YYYY`.
- [x] `git commit` — sync overview spec with density + actual-arc slice.

---

## Spec changes

To apply during phase 5 (not before):

1. **`specifications/overview.md` § Prior decisions** — reframe "HTML/CSS over canvas" to "HTML + SVG, not canvas/WebGL." Drop the "link following" half of the rationale (it is not exercised). Keep "text selection" and "browser accessibility."
2. **`specifications/overview.md` § Constraints** — change "Rendered with HTML/CSS in `@maskor/frontend` (React + Vite). Not a canvas or WebGL renderer." to make SVG explicit alongside HTML/CSS.
3. **`specifications/overview.md` § Scope (In scope)** — add density tiers as a bullet (e.g. "Density tiers controlling tile content and width: full / compact / mini").
4. **`specifications/overview.md` § Behavior § Navigation** — replace the existing zoom/pan paragraph with: density tiers + horizontal scroll for x-axis navigation + sticky arc panel above the tile row.
5. **`specifications/overview.md` § Implementation status** — add a new "Next slice: density + actual-arc panel" subsection while in progress, or move to "First slice shipped" with a dated line when complete.
6. **`specifications/overview.md` § Open questions** — annotate "Where are arc curves fetched from in the frontend?" as the explicit blocker for the explicit-arc slice. (Actual arcs in this slice are derived client-side; the endpoint is only needed for explicit arcs.)

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Test coverage targets for this slice:

- `@maskor/frontend`: density toggle wiring + URL round-trip, per-tier tile content rendering, arc-data derivation given fixture sequences (including the no-weight case), aspect legend toggle behavior, layout stability when all aspects are toggled off.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
