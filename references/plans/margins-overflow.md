# Margin overflow: free extension + clearer scroll cue

**Date**: 21-06-2026
**Status**: Done
**Specs**: `specifications/margins.md`
**Closed**: 21-06-2026

---

## Goal

An idle (collapsed) comment that is taller than its block **extends downward over the blocks below it until it meets the next anchored comment** — and clips only there. If no comment lies below, it extends freely (no clip). A clipped, overflowing comment shows a **clear, always-visible scrollbar** and can be scrolled to read the rest **without clicking it** (clicking still enters edit mode).

---

## Background (current behaviour)

- Every idle, non-expand-all row is clipped to **its own block's height** (`maxHeight: blockHeight`, `overflow: hidden`) — so even a comment with nothing but empty blocks below it is cut off at the paragraph boundary.
- Overflow is detected in `useMarginGeometry` (DOM `scrollHeight − clientHeight > 2`) and shown only as a faint bottom fade + `…` cue. There is **no scrollbar** — the outer synced column uses `no-scrollbar`, and the clipped row is `overflow: hidden`, so the extra text is unreachable without clicking into edit mode.

Key files: `margins/margin-column.tsx`, `margins/margin-row.tsx`, `margins/use-margin-geometry.ts`, `lib/margins/column.ts`, `styles/global.css`. Anchoring model: ADR 0009; spec `specifications/margins.md` (Layout & alignment).

---

## Design

### 1. Clip boundary = next comment, not the paragraph

- New pure helper (in `lib/margins/column.ts`, unit-tested): given the rows in document order with each row's measured `top` and whether it carries a comment, return per-row the **clip height** = vertical distance from this row's top to the **next commented row's top below it**, or `null` when no comment lies below.
- `null` → render the row **unclipped** (it may extend over the empty blocks below).
- A number → clip the row to that height (spans the intervening un-commented blocks; stops before the next comment so it can never overlap one).
- Expand-all and the active/focused row remain unclipped (unchanged).

### 2. Clear, click-free scrollbar on overflowing rows

- Restructure `MarginRow` so the clip+scroll lives on an **inner container** that holds the comment body, while the **outer** positioned row keeps the pinned remove control and the overflow fade (so the fade does not scroll away). The inner container carries `data-row-index` (the element `useMarginGeometry` measures for overflow).
- An overflowing clipped row gets `overflow-y: auto` with a **visible, thin styled scrollbar** (new `.margin-scrollbar` utility in `global.css`; the comment body is already a non-focusing element, so wheel/drag scrolls it without entering edit mode). Non-overflowing rows stay `overflow: hidden` (no scrollbar chrome).
- Keep the bottom fade/`…` as a secondary "more below" cue, pinned to the outer row.

### 3. Overflow detection stays correct

- `useMarginGeometry` already re-pulls geometry whenever `fragmentContent` / blocks change (adding or removing a comment injects/strips a marker, so `editorBlocks` changes), which is exactly when clip heights change — the existing overflow effect re-runs after the new `maxHeight` is committed. Verify this holds; pass the computed clip heights through if a re-measure trigger turns out to be needed.

---

## Tasks

1. **Setup**
   - [x] Branch `agent/margins-overflow` (already the working branch). _(2026-06-21)_

2. **Clip-boundary logic**
   - [x] Add the pure clip-height helper to `lib/margins/column.ts`. _(2026-06-21)_
   - [x] Unit-test it: no comment below → `null`; comment several blocks below → distance to that block's top; adjacent comment → ~block height; negative clamp. _(2026-06-21)_
   - [x] Wire it into `margin-column.tsx` (compute from `rows` + `editorBlocks`, pass per-row clip height into `MarginRow`). _(2026-06-21)_

3. **Row markup + scrollbar**
   - [x] Restructure `MarginRow`: inner scroll/clip container (carries `data-row-index`, `maxHeight`, `overflow-y-auto`), outer keeps remove control + fade. _(2026-06-21)_
   - [x] Add `.margin-scrollbar` utility to `global.css`; applied on clipped rows. _(2026-06-21)_
   - [x] `data-slot-marker` / `data-slot-block` and absolute `top` stay on the outer positioned row. _(2026-06-21)_

4. **Tests + verify**
   - [x] Extended `margin-column.test.tsx` (no-clip-when-none-below; clip-to-gap + scrollbar) and `column.test.ts` (helper). _(2026-06-21)_
   - [x] `bun run format` then `bun run verify` — all green. _(2026-06-21)_

5. **Close-out**
   - [x] Update `specifications/margins.md` (Shipped + Layout/collapse notes) and tick the TODO item. _(2026-06-21)_
   - [ ] `git commit` the batch.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Pure helper covered by `lib/margins/column.test.ts`.
- Component behaviour (clip vs no-clip, scrollbar presence) covered by `margin-column.test.tsx`. Note: happy-dom has no layout, so tests assert on the applied inline styles / classes, not real pixel overflow (mirroring the existing clip test).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`, and update the relevant `Shipped` frontmatter of `specifications/margins.md`.
