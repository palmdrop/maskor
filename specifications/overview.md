# Spec: Overview

**Status**: Stable
**Last updated**: 2026-04-27

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
- Zoom and pan of the sequence view
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

- The view supports zoom in/out and pan left/right (and vertically if arc overlays overflow).
- Rendered with HTML/CSS, not canvas or WebGL, to preserve text selection, link following, and browser accessibility.

### Rearrangement

- The user can reorder fragments by dragging tiles to new positions.
- Arrow-key rearrangement moves a selected tile one position forward or back.
- Moving a tile within a section updates its intra-section position.
- Moving a tile to a different section reassigns it to that section.
- All rearrangements are persisted via API calls to sequence position data in the DB. No vault files are modified.

### Sequence selection

- The user can switch between the main sequence and any secondary sequences.
- The main sequence is the default view on open.

---

## Constraints

- Rendered with HTML/CSS in `@maskor/frontend` (React + Vite). Not a canvas or WebGL renderer.
- All sequence data (positions, fitting scores, arc positions) is read from the API. No vault file access from the frontend.
- Changes made in the overview (rearrangements) are persisted via API calls. The DB owns sequence positions; vault files are never modified.
- The DB schema for sequences, sections, and fragment positions is defined in `sequencer.md` — implementation is blocked until those tables exist.
- Arc curve and color data must be available via the API before arc overlays can be implemented.

---

## Prior decisions

- **HTML/CSS over canvas**: Explicitly chosen to preserve text selection, link following, and browser accessibility. Canvas-like zoom and pan behavior must be achieved within HTML/CSS constraints.

---

## Open questions

- [ ] 2026-04-27 — Should fitting scores be visualised in the overview (e.g. tile border color or a score badge)?
- [ ] 2026-04-27 — Where does the unassigned pool appear? A sidebar, a separate row above/below the sequence, or is the overview only for placed fragments?
- [ ] 2026-04-27 — Are secondary sequences viewable in the overview, or only the main sequence? Secondary sequences are defined in `sequencer.md`.
- [ ] 2026-04-27 — How is aspect color-coding resolved when a fragment has high weights for multiple aspects (most-dominant wins, blend, or user picks which aspect to highlight)?
- [ ] 2026-04-27 — Does the overview serve as the entry point for placing unassigned fragments, or only for rearranging already-placed ones?
- [ ] 2026-04-27 — Where are arc curves fetched from in the frontend? Arc data is vault-stored in `<vault>/.maskor/config/arcs/` (see `aspect-arc-model.md`) and served via the API. An arc endpoint needs to be defined before arc overlays can be implemented.

---

## Acceptance criteria

- All fragments assigned to a sequence appear as tiles in the correct sequence order.
- The main sequence is shown by default when the overview opens.
- Sections appear as labeled groupings containing their member fragment tiles, visually distinct from each other.
- Arc overlays are rendered as graphs aligned to the sequence position axis and are individually toggleable.
- Dragging a tile to a new position updates the fragment's sequence position (confirmed via an API call that returns the updated order).
- Arrow-key navigation moves a selected tile one position in either direction.
- The view is pannable and zoomable without layout breaking or tiles becoming illegible.
- Toggling off all arc overlays leaves the fragment tile layout unchanged.
