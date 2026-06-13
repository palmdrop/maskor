# Placement modal becomes an active-fragment-centric DnD arranger

**Status**: accepted (supersedes ADR-0006)

ADR-0006 made the "Place in sequence…" modal a keyboard/button-only surface, deliberately avoiding drag-and-drop to keep a drag-gate out of the Overview's hot path. We are reversing that: the modal becomes a **mini version of the Overview's left column** (`ReorderList`) with full drag-and-drop, scoped to one chosen sequence. It stays distinct from the Overview by being launched from the fragment editor, scoped to a single sequence, and **pre-focused on the active fragment** (highlighted, scrolled into view, with quick add/move/remove-active affordances retained). The driver for the change: users found the button/keyboard interaction slower and inconsistent with the Overview, and "slim it down + give it drag-and-drop, a mini overview" was the explicit ask.

## Considered Options

- **Keep ADR-0006 (keyboard/button only), just slim the modal** — lowest risk, no shared-component extraction. Rejected: does not deliver the requested direct-manipulation parity with the Overview; the two surfaces stay conceptually split for no user benefit.
- **Active-fragment drag only** — make only the active tile draggable, rest static. Rejected: cannot reuse `ReorderList` as-is (it makes every row draggable), so it means a second bespoke drag implementation — more code, more drift, not less.
- **General per-sequence arranger (no active emphasis)** — just the Overview left column in a dialog. Rejected: with no active-fragment emphasis it is a near-identical clone of the Overview with no reason to exist over navigating there.

## Consequences

- `ReorderList` + `useSequenceDnD` must be **lifted into a shared component** consumable by both the Overview and the modal. The hook and ~20 section-editing props are currently page-coupled; this extraction is the bulk of the work and the main reversibility cost.
- The "redundant clone" worry ADR-0006 raised is answered by the active-fragment emphasis + editor-launch context. If that emphasis is ever dropped, this ADR's justification collapses and the modal should be removed in favor of Overview navigation.
- Both surfaces continue to commit against the same `placeFragment`/`moveFragment`/`unplaceFragment` endpoints, so they cannot drift at the data layer.
- `handleFragmentKeyboardMove` / `computeStepMoveTarget` movement logic stays shared; keyboard moves remain available in the modal alongside drag.
