# Spec: Overview

**Status**: Stable
**Last updated**: 2026-06-13

**Shipped**:

- 2026-05-12 — Users can arrange fragments on the overview: all non-discarded fragments appear as draggable tiles in two zones (sequence + unassigned pool); dragging between zones places or unplaces a fragment; dragging within the sequence reorders it; all changes survive a reload. (plan: references/plans/sequencer-manual-placement.md)
- 2026-05-19 — Density tiers (`full`/`compact`/`mini`) drive tile content and width via a `?density=` URL search param; a sticky arc panel above the tile row renders one Catmull-Rom-smoothed curve per aspect (actual arcs derived client-side from `FragmentSummary.aspects`); a chip-row legend toggles aspects on/off; aspect color metadata is round-tripped through vault frontmatter with a deterministic palette fallback. (plan: references/plans/overview-density-and-actual-arc.md)
- 2026-05-28 — Overview density choice persists across navigation and page reloads via `project.overview.density` in project.json; URL param (`?density=`) is now optional and serves as a per-session override that seeds the URL on change; absence of the URL param falls back to the persisted value. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)
- 2026-05-28 — Arrow-key rearrangement for fragment tiles: focused tiles sync selection state; ArrowLeft/ArrowRight move the selected fragment one position forward or back. Moving past a section boundary reassigns the fragment to the adjacent section. Uses the same `moveFragment` API call as drag-and-drop so the action log records the same entry type. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)
- 2026-05-28 — Section reordering via drag-and-drop (grab handle on section header) and keyboard (Shift+ArrowLeft/Right moves the section that contains the selected fragment). Logs `sequence:section-reordered` per move. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)
- 2026-05-31 — Sequence sidebar surfaces the `active` flag: each non-main sequence has an active/inactive toggle (logs `sequence:activated`/`sequence:deactivated`) controlling whether it constrains the main sequence; inactive rows are dimmed. Import-sequences appear like any sequence with an "imported" badge and an `origin` provenance tooltip. (plan: `references/plans/import-sequence.md`)
- 2026-06-05 — In-context fragment editing on the working surface: the shared per-fragment renderer is select-to-edit — highlighting text in a rendered chunk (or its hover pencil) opens an inline markdown editor seeded with that fragment's body, in both the prose spine and the right detail panel. Saving routes the new content back to the chunk's own fragment via the existing fragment update path and reflows the spine; ⌘/Ctrl+Enter saves, Esc cancels. (plan: `references/plans/overview-redesign.md` Phase 4, ADR 0011) **Superseded 2026-06-11 — see below (ADR 0013).**
- 2026-06-11 — In-context editing now opens the full fragment editor as a **center-replacing overlay** (the spine is hidden — kept mounted for instant close — while the reorder list + detail panel stay), replacing the per-chunk in-place editor and the select-to-edit affordance. Double-click or the hover pencil opens it; Previous/Next walk the spine order (pool + discarded excluded), `⌘Esc` (or Close) saves then exits, and on close the spine scrolls back to the top of the last-shown fragment. The editor owns the save round-trip; the page invalidates the sequence contents + summaries so the spine reflows. (ADR 0013; plan: `references/plans/fragment-editor-focus-mode.md`)
- 2026-06-08 — One-click remove-from-sequence: each placed fragment carries a direct "remove from sequence" affordance (returning it to the pool) in all three surfaces — a hover trash button in the prose spine and the left reorder column, plus a "Remove from sequence" button in the right detail panel. Pool fragments and fragments not placed in the active sequence get no affordance. Dispatches through the new `overview:unplace-fragment` command (also palette-discoverable) onto the existing optimistic unplace mutation that drag-to-pool already uses.
- 2026-06-11 — Clicking a fragment in the left ordering column reveals it in the prose spine (scrolls it into view) and writes a shareable `#fragment-<uuid>` URL anchor; modifier (cmd/shift) clicks only adjust the multi-selection and do not scroll. On load the anchor reconciles with the remembered scroll position: an external deep-link anchor scrolls to its fragment, while a leftover anchor from an in-app click yields to the remembered scroll. (plan: `references/plans/overview-scroll-list-sort-and-panel-excerpt.md`)
- 2026-06-11 — The right detail panel is now a read-only excerpt (key + server excerpt) rather than an inline editor, so long fragments no longer overflow the narrow column. The prose spine remains the in-context editing surface and "Open fragment" routes to the full editor. (Supersedes the right-panel half of the 2026-06-05 in-context editing entry.) (plan: `references/plans/overview-scroll-list-sort-and-panel-excerpt.md`)
- 2026-06-13 — Selecting an import-sequence (a sequence carrying an `origin`) renders the overview read-only: the unassigned pool is hidden, both drag contexts are disabled, section editing is suppressed, and a "clone to rearrange" banner is shown. Mirrors the backend read-only guard in `sequencer.md`. (plan: `references/plans/sequence-placement-improvements.md`, ADR 0014)
- 2026-06-13 — Keyboard fragment sorting (↑/↓ move fragment, Shift+↑/↓ move section) now fires whether focus is in the left reorder column or on a fragment selected through the prose spine — previously the handler was bound only to the spine container and selecting in the spine focused nothing, so the keys reached neither surface. Focus follows the moved fragment so repeated presses keep sorting across section boundaries. Also corrects the spec direction (the vertical redesign replaced the original horizontal ArrowLeft/ArrowRight binding with ArrowUp/ArrowDown). (plan: `references/plans/sequence-placement-improvements.md`)
- 2026-07-16 — Title-mode length bars in the prose spine: at the "title" detail level each fragment entry carries a thin horizontal bar whose width is the fragment's content length relative to the longest placed fragment in the sequence, so the length distribution stays visible with bodies collapsed. Computed client-side from the spine's bulk content (fragments whose content hasn't loaded show no bar); the right detail panel is unaffected.
- 2026-07-17 — Cross-surface highlight on sequence hover: hovering a non-active sequence's row in the left sequence sidebar highlights that sequence's member fragments wherever they appear in the active sequence's surfaces — the reorder left column (placed rows), the prose spine, and the plotted dots in both the aspect-arc and length graphs (a sky ring on rows/spine entries, an enlarged ringed dot in the graphs). The highlight is distinct from and coexists with selection, clears on mouse-leave, and shows nothing when the active sequence's own row is hovered. Advisory visual only; purely client-side. (plan: `references/plans/sequence-hover-highlight.md`)
- 2026-07-17 — Fragment cross-hover: hovering a fragment in the reorder left column or the prose spine softly highlights that same fragment in the other surface, and softly emphasizes its dot in both the aspect-arc and length graphs (a neutral fill on the row/spine entry, a slightly enlarged muted-ring dot in the graphs). Deliberately softer than — and layered under — the sky sequence-hover/pin highlight (the strong sequence highlight wins on a dot that is both). Advisory visual only; purely client-side.
- 2026-07-17 — Pin-select a sequence (sidebar gesture rework): single-clicking a non-active sequence row **pins** it — its cross-highlight (above) persists while the user stays in and rearranges the active sequence; clicking it again unpins; clicking the active row does nothing. **Double-click** now switches the active sequence (navigates). A hovered row still takes transient precedence over the pin. The pinned row shows a sky ring; the pin clears when the active sequence changes. Consequence: double-click no longer triggers rename (rename remains on the "⋯" menu's Rename item and the `overview:rename-sequence` palette command).
- 2026-07-17 — Length graph overlay: a summonable "Length" panel (toggle in the sequence header beside "Arcs", command `overview:toggle-length-overlay`) plots each placed fragment's content length (character count, normalized to the longest placed fragment) as a single raw per-fragment Catmull-Rom line over the same sequence-index x-axis as the aspect-arc overlay, with the section-boundary bar beneath and an Expand/Collapse scroll mode. Advisory only — it surfaces length variation so the writer can avoid clustering long fragments, with no scoring or enforcement. Purely client-side from the already-loaded sequence contents (fragments whose content hasn't loaded are omitted); reuses the arc rendering primitives. (plan: `references/plans/length-graph.md`)
- 2026-06-11 — Sequence sidebar rows can be renamed, and their per-row actions are decluttered into a single hover-revealed "⋯" menu. Rename is triggerable via the menu's "Rename" item and the palette command `overview:rename-sequence` (a sequence picker) — both open the existing inline editor seeded with the current name. (Double-click was also a rename trigger until 2026-07-17, when it was reassigned to switching the active sequence — see that entry.) The previously separate clone / insert / activate-deactivate / delete hover icons collapse into that one menu. The inactive-constraint state keeps its row dimming and gains a small static unlink marker (the active/inactive toggle moved into the menu).

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
- Arrow-key rearrangement moves a selected fragment one position forward or back. **ArrowUp** moves the fragment one position earlier; **ArrowDown** moves it one position later. Matches the vertical layout of the reorder column and the prose spine. The keys act whether focus is in the left reorder column or on a fragment selected through the spine (selecting in the spine focuses the spine container); elsewhere ↑/↓ still scroll.
- Moving a fragment within a section updates its intra-section position.
- Moving a fragment past the start or end of a section reassigns it to the adjacent section's boundary (to the end of the previous section, or the start of the next section respectively). Focus follows the moved fragment so repeated ↑/↓ keep sorting across section boundaries.
- **Section reordering**: sections can be reordered by dragging via a grab handle on the section header (visible on hover/focus when multiple sections exist), or by keyboard (**Shift+ArrowUp** / **Shift+ArrowDown** while a fragment in that section is selected). Each section move logs a `sequence:section-reordered` entry.
- All rearrangements are persisted via API calls to sequence position data in the DB. No vault files are modified.
- Arrow-key moves use the same `moveFragment` API call as drag-and-drop, so the action log records the same entry type.

### Sequence selection

- The user can switch between the main sequence and any secondary sequences.
- The main sequence is the default view on open.
- The sidebar lists every sequence, including auto-created import-sequences (marked with an "imported" badge and an `origin` provenance tooltip).
- Each non-main sequence has an active/inactive toggle. An active sequence is consumed by the sequencer as an ordering constraint on the main sequence; an inactive one is not (see `sequencer.md`). Import-sequences are created inactive, so the user opts in by toggling them active. Inactive rows are visually dimmed.
- Selecting an **import-sequence** renders the overview read-only: no unassigned pool, no drag, and no section editing, with a "clone to rearrange" banner. Import-sequences are frozen snapshots of the original import order (see `sequencer.md`); to build on one the user clones it.

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
- **Arrow-key direction is ArrowUp/ArrowDown, not ArrowLeft/ArrowRight**: the reorder column and the prose spine both lay fragments out vertically, so up/down matches the spatial arrangement. (The original tile grid was horizontal and used left/right; the vertical redesign changed the binding.) Moving past a section boundary wraps to the adjacent section's end or start rather than stopping.
- **Section reorder uses Shift+Arrow, not a separate binding**: Section keyboard reorder is bound to Shift+ArrowUp/Shift+ArrowDown so it is spatially consistent with fragment-level moves (no modifier) and does not conflict with other shortcuts. Drag handles are shown on the section header row only when multiple sections exist.
- **Keyboard sort is focus-scoped, not global**: the handler is bound to the reorder column and the spine container (not the page), so ↑/↓ only sort while focus is in one of them. Selecting a fragment in the spine focuses the spine's scroll container (the prose blocks are not individually focusable), which is what routes the keys there.

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
