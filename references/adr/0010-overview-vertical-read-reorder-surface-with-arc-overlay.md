# Overview is a vertical read/reorder surface; arcs are an expandable overlay

**Status**: accepted — redefines the **Overview** in `specifications/_glossary.md` (was "a horizontal layout of fragment tiles with arc overlays") and retires the **Tile** concept. Informs `specifications/sequencer.md` (the sequencer view) and `specifications/overview.md` if/when written.

The legacy Overview laid fragments out as a horizontal row of tiles with aspect arcs drawn above. For long projects (many fragments) this forced constant left/right scrolling, showed only tile-sized excerpts of the writing, and made the prose itself unreadable. The redesign makes the Overview a **vertical** working surface: a vertical spine of fragments rendered as flowing prose (collapsible down a level-of-detail axis to title+excerpt, then title-only), flanked by a draggable reorder list with the unassigned pool (left) and a selected-fragment detail panel (right). Aspect arcs move into a **summonable horizontal overlay** — a compressed multi-aspect graph with a minimized sections bar — that expands into a full zoomable arc view.

## Why

- **Vertical for reading and reordering; horizontal for arcs.** Prose reads top-to-bottom and reordering via a compact title list is naturally vertical, so the spine is vertical and uses ordinary vertical scroll. But rise/fall in a graph is easier to process horizontally (x = position, y = weight). Rather than compromise either, the spine is vertical and the arc graph stays horizontal, decoupled into an overlay.
- **Level of detail is the organizing axis, not discrete modes.** The core problem is overview at scale: long projects have too many fragments to see at once. Both the spine (prose → title+excerpt → title-only) and the arcs (inline glance → compressed overlay → full zoomable view) zoom independently, so the user dials in the fidelity each task needs.
- **One surface, arc grows.** The overlay expands into the full analytical view rather than living on a separate route, so there is a single working surface and a single arc component at two sizes — no divergent second page to maintain.

## Considered options

- **Keep horizontal, fix with zoom-to-fit** (compress tiles to thin columns). Rejected: keeps the awkward axis for reading prose and still can't show the writing coherently.
- **Vertical arcs beside the spine as the primary arc view.** Rejected as primary because vertical rise/fall is harder to read; retained as a _secondary_ lightweight glance strip (Phase 1b), not the analytical surface.
- **A separate dedicated Arc page.** Rejected: the expand-overlay covers deep arc work without a second route; revisit only if arc editing / interleaving / key-fragment authoring outgrows an overlay.

## Consequences

- The name `Overview` and the `/overview` route + `overviewScope` are retained; their meaning changes.
- `Tile`, `TileContent`, `SortableTile`, and the horizontal `computeSequenceLayout` are retired or heavily reworked; the arc overlay reuses `ArcPanel`/`useArcData` but re-maps the x-axis from sequence index (and fit-to-width) instead of tile centers.
- In-context fragment editing is a planned later addition to this surface (it is read-and-rearrange today).
