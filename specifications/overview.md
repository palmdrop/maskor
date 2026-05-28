# Spec: Overview

**Status**: Stable
**Last updated**: 2026-05-19

**Shipped**:

- 2026-05-12 — Users can arrange fragments on the overview: all non-discarded fragments appear as draggable tiles in two zones (sequence + unassigned pool); dragging between zones places or unplaces a fragment; dragging within the sequence reorders it; all changes survive a reload. (plan: references/plans/sequencer-manual-placement.md)
- 2026-05-19 — Density tiers (`full`/`compact`/`mini`) drive tile content and width via a `?density=` URL search param; a sticky arc panel above the tile row renders one Catmull-Rom-smoothed curve per aspect (actual arcs derived client-side from `FragmentSummary.aspects`); a chip-row legend toggles aspects on/off; aspect color metadata is round-tripped through vault frontmatter with a deterministic palette fallback. (plan: references/plans/overview-density-and-actual-arc.md)
- 2026-05-28 — Overview density choice persists across navigation and page reloads via `project.overview.density` in project.json; URL param (`?density=`) is now optional and serves as a per-session override that seeds the URL on change; absence of the URL param falls back to the persisted value. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)
- 2026-05-28 — Arrow-key rearrangement for fragment tiles: focused tiles sync selection state; ArrowLeft/ArrowRight move the selected fragment one position forward or back. Moving past a section boundary reassigns the fragment to the adjacent section. Uses the same `moveFragment` API call as drag-and-drop so the action log records the same entry type. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)

---

## Outcome

The user can see all fragments in a sequence displayed as a visual timeline, inspect how arcs rise and fall across positions, and understand how aspects are distributed across the sequence. From this view the user can also rearrange fragments directly without switching to a separate tool.

---

## Scope

### In scope

- Displaying all fragments in a sequence as positioned tiles along a visual timeline
- Displaying sections as labeled groupings of fragment tiles
- Showing arc trajectories as graph overlays (one per arc, user-defined colors)
- Aspect visibility via color-coding and/or filters on fragment tiles
- Density tiers controlling tile content and width: `full` (key + excerpt + aspect chips), `compact` (key + thin color bar), `mini` (color bar only)
- Horizontal scroll for x-axis navigation; a sticky arc panel above the tile row sharing the same x-axis
- Rearranging fragment positions via drag-and-drop or keyboard (arrow keys)
- Switching between the main sequence and any secondary sequences
- Tile width proportional to fragment content length
- Optional short text excerpt visible within each tile
- Placing unplaced fragments

### Out of scope

- Editing fragment content (that is the fragment editor's job)
- Editing arc or aspect definitions (that is the project configuration view)
- Export operations (see `specifications/export.md`)
- The sequencer placement algorithm and fitting score computation (see `specifications/sequencer.md` and `specifications/fitting-score.md`)
- Creating or deleting sequences from the overview
- Viewing discarded fragments (they have no sequence position)

> The overview is a read-and-rearrange surface, not an editing surface. It does not own fragment content or arc/aspect configuration.

---

## Behavior

### Fragment tiles

- Each fragment assigned to a sequence is rendered as a tile.
- Tiles can be set to display a width related to fragment content length (not necessarily proportional; this could be a view setting)
- Each tile can display title, content excerpt, aspects, or other related properties. User can choose which values to display.
- Tiles are ordered along a horizontal axis matching the sequence order.
- The `readyStatus` of a fragment may be indicated visually on the tile (e.g. as a color or icon).

### Sections

- Sections are visible as distinct labeled groups of consecutive fragment tiles.
- Section boundaries are clearly marked.
- Sections can be reordered as units — moving a section moves all of its tiles together.

### Arc overlays

Two arc curves are shown per aspect (when relevant):

- **Actual arc** — the curve derived from the current placement of fragments and their aspect weights. Always computable once at least one weighted fragment is placed. Shown by default. This is the real shape of the sequence as it currently stands.
- **Explicit arc** — the user-authored target curve (if one exists for this aspect). Shown alongside the actual arc so the user can see the gap between intent and reality.

Both curves share the same horizontal axis aligned to fragment positions. When an explicit arc exists, the gap between the two curves is the primary visual signal for where re-arrangement or new fragments are needed.

Each arc uses a user-defined color. Individual arcs can be toggled on or off. Showing actual-arc-only (no explicit arc) is valid and useful — it lets the user inspect the emergent shape of their arrangement without having defined any targets.

The arc graph shares the horizontal axis with the fragment tiles — a point on the graph corresponds to the fragment tile at that sequence position. See `aspect-arc-model.md` for the arc data model.

### Aspect display

- Fragments can be color-coded by a selected aspect or by aspect weight for that aspect.
- A filter panel allows hiding fragments below a weight threshold for a selected aspect.
- Exact interaction model (color-coding, badges, filters, or a combination) is an open question.

### Navigation

- X-axis navigation is via horizontal scroll on a single sequence container shared by the tile row and the arc panel; the panel translates with the tiles on horizontal scroll so both share the same x-axis.
- The arc panel sticks to the top of the sequence container during vertical scroll; horizontal scroll moves the tile row beneath it.
- Tile size is controlled by a density tier (`full`, `compact`, or `mini`) selectable in the page header. The chosen density is persisted to `project.overview.density` in project.json and is also reflected in the optional `?density=` URL search param. The URL param serves as a per-session override; when absent, the page reads from project.json. This means density survives navigation away-and-back and page reloads without any manual action from the user.
- Rendered with HTML/CSS and inline SVG (no canvas or WebGL) to preserve text selection and browser accessibility.

### Rearrangement

- The user can reorder fragments by dragging tiles to new positions.
- Arrow-key rearrangement moves a selected tile one position forward or back. **ArrowLeft** moves the fragment one position earlier; **ArrowRight** moves it one position later. Matches the horizontal tile layout within sections.
- Moving a tile within a section updates its intra-section position.
- Moving a tile past the start or end of a section reassigns it to the adjacent section's boundary (to the end of the previous section, or the start of the next section respectively).
- All rearrangements are persisted via API calls to sequence position data in the DB. No vault files are modified.
- Arrow-key moves use the same `moveFragment` API call as drag-and-drop, so the action log records the same entry type.

### Sequence selection

- The user can switch between the main sequence and any secondary sequences.
- The main sequence is the default view on open.

---

## Constraints

- Rendered with HTML/CSS and inline SVG in `@maskor/frontend` (React + Vite). Tile content is HTML/CSS; the arc panel is an inline `<svg>` in the same DOM tree. Not a canvas or WebGL renderer.
- All sequence data (positions, fitting scores, arc positions) is read from the API. No vault file access from the frontend.
- Changes made in the overview (rearrangements) are persisted via API calls. The DB owns sequence positions; vault files are never modified.
- The DB schema for sequences, sections, and fragment positions is defined in `sequencer.md` — implementation is blocked until those tables exist.
- Arc curve and color data must be available via the API before arc overlays can be implemented.

---

## Implementation status

**First slice shipped (2026-05-12):** `/overview` route now renders a live sequencer surface. Sequence zone (horizontal sortable row) + unassigned pool (wrappable grid). Drag-and-drop with `@dnd-kit/core` + `@dnd-kit/sortable`. Optimistic updates with React Query rollback.

**Second slice shipped (2026-05-19):** Density tiers, sticky arc panel, and per-aspect legend toggles. The three sections of the sequence now sit in one horizontal scroller; an `<svg>` arc panel sticks to the top of that scroller and renders one Catmull-Rom curve per aspect, derived client-side from `FragmentSummary.aspects` and per-aspect colors (vault `aspects/*.md` frontmatter `color` field, with a deterministic palette fallback). Arc x-coordinates are computed from a single layout formula shared with the tile row so points land on tile centers without DOM measurement. Arc recomputation is gated on `@dnd-kit`'s `activeDragId` to avoid per-frame churn during drag.

**Deferred to follow-up plans:**

- Explicit-arc overlays (the user-authored target curves; require an arc data endpoint — see `aspect-arc-model.md` and the open question below)
- Sections UI (data model and storage are ready; UI labels and reordering are deferred)
- Secondary sequences picker
- Aspect color-coding by selected aspect / weight-threshold filter panel on tiles (legend toggles only hide arcs, not tiles)
- Fitting score visualisation on tiles
- User-configurable curve interpolation (currently hard-coded Catmull-Rom)
- DOM virtualization for very long sequences
- Aspect color editor UI (color is read-only from vault frontmatter for now)

---

## Prior decisions

- **HTML + SVG, not canvas/WebGL**: Tile content is rendered with HTML/CSS and the arc panel is inline SVG in the same DOM tree. Chosen to preserve text selection and browser accessibility. SVG is essential for the arc layer and is the prescribed renderer there.
- **Density tiers replace continuous zoom**: The user picks a fixed legibility tier (`full`/`compact`/`mini`) instead of zooming continuously. Layout is deterministic at each tier, which lets the arc panel compute x-coordinates from a shared formula without DOM measurement.
- **Density persisted to project.json, not only URL**: The chosen density tier is saved to `project.overview.density` so it survives navigation away-and-back and page reloads. The `?density=` URL param is now optional: when present it overrides the persisted value (useful for sharing a link at a specific tier); when absent the page falls back to the stored value. Any user-initiated change saves to project.json and updates the URL param simultaneously.
- **Arrow-key direction is ArrowLeft/ArrowRight, not ArrowUp/ArrowDown**: Tiles within a section are laid out in a `flex-row` (horizontal), so left/right matches the spatial arrangement. Moving past a section boundary wraps to the adjacent section's end or start rather than stopping.

---

## Open questions

- [ ] 2026-04-27 — Should fitting scores be visualised in the overview (e.g. tile border color or a score badge)?
- [x] 2026-04-27 — Where does the unassigned pool appear? A sidebar, a separate row above/below the sequence, or is the overview only for placed fragments? **Resolved 2026-05-12**: Pool appears as a separate zone below the sequence row, rendered as a wrappable grid of tiles. Pool is implicit (all non-discarded fragments not in any section of the main sequence) — no server-side pool entity.
- [ ] 2026-04-27 — Are secondary sequences viewable in the overview, or only the main sequence? Secondary sequences are defined in `sequencer.md`.
- [ ] 2026-04-27 — How is aspect color-coding resolved when a fragment has high weights for multiple aspects (most-dominant wins, blend, or user picks which aspect to highlight)?
- [x] 2026-04-27 — Does the overview serve as the entry point for placing unassigned fragments, or only for rearranging already-placed ones? **Resolved 2026-05-12**: Both. The pool zone is a drag source; dragging a pool tile into the sequence zone places it. The overview is the primary placement surface.
- [ ] 2026-04-27 — Where are **explicit** arc curves fetched from in the frontend? Arc data is vault-stored in `<vault>/.maskor/config/arcs/` (see `aspect-arc-model.md`) and served via the API. **Blocker for the explicit-arc slice.** Actual arcs (the curves derived from placed fragments) are computed client-side from `FragmentSummary.aspects` and do not depend on this endpoint — only the user-authored target curves do.

---

## Acceptance criteria

- All fragments assigned to a sequence appear as tiles in the correct sequence order.
- The main sequence is shown by default when the overview opens.
- Sections appear as labeled groupings containing their member fragment tiles, visually distinct from each other.
- Arc overlays are rendered as graphs aligned to the sequence position axis and are individually toggleable.
- Dragging a tile to a new position updates the fragment's sequence position (confirmed via an API call that returns the updated order).
- Arrow-key navigation moves a selected tile one position in either direction.
- The user can switch tile density (`full`/`compact`/`mini`) and horizontally scroll the sequence without layout breaking; the arc panel stays vertically pinned and remains aligned to the tiles on horizontal scroll.
- Toggling off all arc overlays leaves the fragment tile layout unchanged.
