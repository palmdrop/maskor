# Placement modal is a separate surface from the Overview arranger

**Status**: superseded by ADR-0014 — the modal now reuses the Overview's `ReorderList` + `useSequenceDnD` with drag-and-drop, scoped to one sequence and pre-focused on the active fragment. The reasoning below is retained for context.

The "Place in sequence…" command (command-palette → pick a sequence → modal) lets the user add, move, and remove the **active fragment** within one chosen sequence. The Overview is already a full sequence-arranging surface built on drag-and-drop (`useSequenceDnD`, `SortableTile`, keyboard moves). Rather than reuse that DnD core inside the modal, the placement modal is a **separate keyboard- and button-driven surface** that reuses only the _presentational_ pieces (`TileContent` at `compact` density, section chrome) and the existing `handleFragmentKeyboardMove` movement logic. It does not reuse `useSequenceDnD` or make every tile draggable.

## Considered Options

- **Gate the shared arranger** — extract a `<SequenceArranger>` from `OverviewPage` and pass a `manipulableFragmentUuid` flag so the modal renders the full arranger with only the active fragment draggable. Rejected: the command palette is keyboard-driven, so the modal does not need drag at all; threading a manipulation-gate through the DnD hook adds capability to the Overview's hot path purely to serve the modal, and the modal would still have to suppress drag affordances it inherits.
- **Reuse the whole arranger with full editing** — drop the active-only constraint and let the modal drag anything. Rejected: contradicts the feature's intent ("we only concern ourselves with the active fragment") and makes the modal a redundant clone of the Overview.

## Consequences

- There are now **two** sequence-arranging surfaces. A future reader who expects them to share an interaction core will not find one — they intentionally share only presentation. Unifying them later is possible but not free.
- Movement logic (`handleFragmentKeyboardMove`) must be lifted into shared code so the two surfaces cannot drift on "what does moving a fragment one step do".
- `TileContent` hardcodes `cursor-grab`; the cursor must become conditional so the non-drag modal does not imply draggability.
- Both surfaces commit live against the same `placeFragment`/`moveFragment`/`unplaceFragment` endpoints, so they stay consistent at the data layer regardless of interaction differences.
