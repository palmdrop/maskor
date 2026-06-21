# Review: Margin overflow — free extension + scroll cue

**Date**: 2026-06-21
**Scope**: `packages/frontend/src/components/margins/`, `packages/frontend/src/lib/margins/column.ts`, `packages/frontend/src/styles/global.css`
**Plan**: `references/plans/margins-overflow.md`
**Spec**: `specifications/margins.md`

---

## Overall

The implementation matches the plan: the pure `computeCommentClipHeights` helper computes the gap to the next comment (or `null`), the clip+scroll moved to an inner `data-row-index` container, the fade stayed pinned to the outer row, and the `.margin-scrollbar` utility is wired in. Tests are green (32 passing) and the helper is well covered. One real interaction defect falls out of the new "extend over the blocks below" behaviour that the plan did not account for: the intervening empty slots paint **on top of** the extended comment.

---

## Bugs

> **Resolved 2026-06-21.** Bug 1 and Minors 2–3 fixed in this branch (see resolution notes below). A new pure helper `computeCoveredSlots` + unit tests were added; `bun run verify` green.

### 1. Empty slots below an extending comment overlap it (wrong click target + dead scroll bands)

`margin-column.tsx:280-304`, `margin-row.tsx:140-148` — Rows are absolute-positioned siblings in a `relative` box with no z-index except the active row (`z-10`). An idle comment that now extends over the empty blocks below it (clipped to the next-comment gap, or free when `null`) is painted **first**; the intervening un-annotated rows come **later in DOM order**, so they paint over it. Each empty row is a thin strip (just the `+ comment` button + `pb-1`, ~20px) pinned at its block's top.

```
comment row painted at top T0 (extends down over B1, B2)
empty row B1 at top T1  → paints ON TOP of the comment in a ~20px band
empty row B2 at top T2  → paints ON TOP of the comment in a ~20px band
```

Consequences within each band:
- Hovering the comment to read/scroll it triggers the empty row's `group-hover`, surfacing a `+ comment` button over the comment text.
- Clicking there activates the empty block slot (type-to-create) instead of entering the comment.
- Wheel events over the band hit the non-scrollable empty row, so the comment's own scroll stalls in horizontal strips.

This is new: before this change comments clipped to their own block height and never extended over the blocks below, so the overlap could not occur. It applies to both the clipped (gap) and free (`null`) cases.

Fix: give the extended comment's row precedence over the intervening empty slots — e.g. raise the commented row's stacking (a z-index above idle empty rows) and/or make a covered empty slot non-interactive where a comment extends over it. Worth a quick manual check in the running app to gauge how disruptive the bands feel.

**Resolution.** A z-index swap alone would bury the empty slots' `+ comment` affordance, breaking hover-to-add (a requirement). Instead, an empty slot *covered* by an overflowing comment (detected via the new pure `computeCoveredSlots` helper, fed by `overflowingBlocks`) now renders a **compact, self-revealing `+ comment` button** inside a **`pointer-events-none` row** (only the button is `pointer-events-auto`). Wheel/clicks/hover therefore reach the comment beneath across the whole strip except the small button rect, so the comment stays readable and scrollable, while the covered paragraph remains hover-commentable. Uncovered empty slots keep their full-width group-hover button unchanged. Trade-off (reduced discoverability of covered slots) and two minor remaining edges logged in `references/suggestions.md`.

---

## Design

None.

---

## Minor

### 2. `clipHeight || undefined` swallows a legitimate `0`

`margin-row.tsx:124` — `maxHeight: clipHeight || undefined` turns a `0` clip height into "no max-height", so the container renders unclipped while still carrying `data-row-index` and the scrollbar class. `computeCommentClipHeights` can return `0` only via the negative clamp on out-of-order tops (`column.ts:55`), which shouldn't arise in normal flow — so this is a latent edge, not a live defect. If you want it exact, branch on `clipHeight === null` for the unclipped path and pass the number (including 0) through otherwise.

**Resolution.** Made consistent at the source: `computeCommentClipHeights` now returns `null` (not `0`) for a non-positive gap, so a row is either truly unclipped (`null`, no `data-row-index`) or clipped to a positive height. `margin-row.tsx` passes `maxHeight: clipHeight` directly. The degenerate-gap unit test now expects `[null, null]`.

### 3. Single-line `if` without braces

`column.ts:56` — `if (row.hasComment) nextCommentTop = row.top;` omits braces, which `CODING_STANDARDS.md` forbids. It matches the existing local style in the same file (lines 34, 74), so it's consistent but technically off-standard. Low priority.

**Resolution.** Braced in the rewritten helper. (Pre-existing braceless `if`s elsewhere in the file left untouched — out of scope.)

---

## Non-issues

- **`data-row-index` now only on clipped rows** — the geometry hook (`use-margin-geometry.ts:105-108`) skips a `null` `querySelector`, so unclipped/free rows are correctly excluded from `overflowingBlocks`, and `isOverflowing` is additionally gated on `clipHeight !== null`. The fade therefore only shows where something is actually clipped. Correct.
- **Overflow detection still measures the right element** — the inner container is now the clipped (`maxHeight` + `overflow-y-auto`) element, so `scrollHeight - clientHeight` on the `data-row-index` node remains the right overflow test.
- **Tests assert on inline styles/classes, not pixels** — happy-dom has no layout; the plan and existing clip test already rely on this, so asserting `maxHeight`/class names is the established pattern.
- **"Always-visible" scrollbar via `overflow-y: auto`** — the `::-webkit-scrollbar` width forces a classic (non-overlay) bar whenever content overflows; it self-hides when the content fits. Matches the intent ("visible when there's more").
