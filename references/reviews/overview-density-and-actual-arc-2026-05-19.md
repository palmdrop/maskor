# Review: Overview — density tiers and actual-arc panel

**Date**: 2026-05-19
**Scope**: `packages/frontend/src/pages/OverviewPage/`, `packages/storage` (aspect `color` field), `packages/api/src/schemas/aspect.ts`, `packages/shared/src/schemas/domain/aspect.ts`
**Plan**: `references/plans/overview-density-and-actual-arc.md`
**Spec**: `specifications/overview.md`, `specifications/aspect-arc-model.md`

---

## Overall

The slice ships everything the plan lists: URL-driven density tiers, per-density tile rendering, a sticky-positioned arc panel with Catmull-Rom curves derived from `FragmentSummary.aspects`, per-aspect legend toggles, and an aspect `color` field round-tripped through vault frontmatter. `bun run verify` is green (649 backend tests, 154 frontend tests). The most important finding: the arc panel is declared `position: sticky; top: 0`, but its containing block (the `overflow-x-auto` scroller) doesn't actually scroll vertically, so on page-level vertical scroll the panel travels with the tile row rather than staying pinned — i.e. the behaviour the plan and spec require is not realised. Other issues are smaller (dead prop, "no weight" vs explicit-zero handling, duplicate import).

---

## Bugs

### 1. Arc panel is not actually sticky on vertical scroll

`packages/frontend/src/pages/OverviewPage/index.tsx:621`, `packages/frontend/src/pages/OverviewPage/components/ArcPanel.tsx:21` — the plan (§ "scope decisions") and `specifications/overview.md:85-86` require the arc panel to stick to the top of the sequence container during *vertical* page scroll, with horizontal scroll moving the tile row beneath it. The arc panel uses `position: sticky; top: 0`, but it sits inside `<div className="overflow-x-auto shrink-0">`. That ancestor is the nearest scroll container, but it has no vertical overflow — its content height matches the contained tile row plus panel — so `top: 0` has nothing to anchor against vertically. The actual vertical scroll lives on the outer `flex-1 ... overflow-y-auto` (line 556), which is a different (and farther) scroll container.

```
user scrolls page vertically
  → outer overflow-y-auto scrolls
  → inner overflow-x-auto container moves with it (no vertical scroll of its own)
  → arc panel inside the inner container moves with the container
  → panel disappears off the top instead of pinning
```

Fix: move the sticky element out of the horizontal scroller, or restructure so the sticky panel lives directly inside the vertical scroller and uses a separate mechanism (e.g. a wrapping element with synced `scrollLeft`) to track horizontal scroll. Either way, verify the behaviour in the browser with a tall pool that forces page-level vertical scroll.

---

## Design

### 2. `TileContent` declares a required `inSequence` prop that is never read

`packages/frontend/src/pages/OverviewPage/components/TileContent.tsx:8`, `TileContent.tsx:89-96` — the prop is on the interface (required), every caller (`SortableTile`, `DragOverlay` in `OverviewPage/index.tsx:811`) is forced to pass it, but the destructuring in the component body omits it and nothing in any of the three density branches uses it. Either branch on it (e.g. differentiate the in-pool vs in-sequence rendering, which is the obvious intent of the name) or drop it from the interface and the call sites. Right now it's API surface that lies about its inputs.

### 3. `buildArcSeries` conflates "weight = 0" with "no weight" — confirmed bug

`packages/frontend/src/pages/OverviewPage/utils/arcData.ts:32` — the filter is `if (weight === undefined || weight <= 0) continue;`. An explicit `weight: 0` means the aspect is assigned to the fragment with a valid value of zero; it is meaningful information, distinct from omission, and must appear on the curve as a point at the bottom of the panel. With the current logic, a fragment that explicitly zeroes an aspect drops out of the series and the spline interpolates straight through neighbours, hiding the dip.

Spec implication: `specifications/aspect-arc-model.md` currently says "Fragments with no weight for an arc'd aspect are ignored in scoring," and the plan repeats this. That wording is ambiguous and the implementation took it to include zero. Both the spec and the comment in `arcData.ts:10-13` should be updated to spell out: "no weight" means the aspect key is absent from `fragment.aspects`; an explicit `weight: 0` is a valid point and is plotted at the floor of the panel.

Fix:
- Update `arcData.ts:32` to `if (weight === undefined) continue;` and let the clamp at line 33 handle anything outside `[0, 1]`.
- Update `specifications/aspect-arc-model.md` to disambiguate "no weight" vs. "explicit zero".
- Update the comment block at `arcData.ts:10-17` to match the new contract.
- Add a unit test in `arcData.test.ts` covering an explicit `weight: 0` to lock the behaviour in.

---

## Minor

### 4. Duplicate import statement from `./components/ArcPanel`

`packages/frontend/src/pages/OverviewPage/index.tsx:45,50` — `ArcPanel` and `ARC_PANEL_HEIGHT` come from the same module but are imported on two separate lines. Combine into one statement.

### 5. Plan wording says "debounce", implementation freezes

`packages/frontend/src/pages/OverviewPage/index.tsx:237-248` — the plan task reads "Debounce arc recomputation during active `@dnd-kit` drag … Recompute immediately on `onDragEnd`." The shipped code freezes the previous result via `arcSeriesCacheRef` until `activeDragId` clears. Behaviour-wise this is fine (mutations only fire on drag-end, so the underlying order doesn't change during drag), but the plan/spec terminology and the implementation now disagree. Either reword the plan note or, if you want a true debounce later, do it explicitly.

### 6. API `color` schema doesn't enforce the hex pattern that the domain schema does

`packages/api/src/schemas/aspect.ts:16,26,37,44` vs `packages/shared/src/schemas/domain/aspect.ts:3-5` — the domain `AspectColorSchema` is a strict `/^#[0-9a-fA-F]{6}$/`. The API extends with plain `z.string().optional()`, so the route schema accepts any string and only the domain layer would reject. If a vault file ever holds `color: red`, the indexer/mapper will pass it through and the frontend will receive it as-is. Tighten the API schema to use `AspectColorSchema` for consistency, or accept that the API is lenient on purpose and add a comment saying so.

### 7. `SectionZone` `min-h-36` is generous at mini density

`packages/frontend/src/pages/OverviewPage/index.tsx:72` — 144px min-height with 24px-tall mini tiles leaves a lot of vertical air per section. Acceptable for the empty-placeholder case, but worth making density-aware once the rest of the slice settles. Not a regression.

---

## Non-issues

- **Plan tasks all checked off, status `Done`, `Closed: 19-05-2026`** — matches the seven commits on the branch, with the spec `Shipped:` line dated 2026-05-19.
- **Arc x-coordinates derived from `computeSequenceLayout` instead of DOM measurement** — intentional and good; it lets the SVG render before tiles lay out and avoids any post-paint correction loop. Layout constants are kept in one file (`utils/layout.ts`) so the tile row and the arc share a single source of truth.
- **Aspect colour fallback uses a deterministic palette hash** — `utils/aspectColors.ts:18-24` djb2-style on the aspect key. Stable across sessions, consistent between the tile colour bar and the arc curves; matches the plan's "stable fallback from a project-scoped palette (deterministic on aspect key)."
- **Aspects without `color` in the index get a palette fallback at the page level, not in the DB** — `OverviewPage/index.tsx:170-188` builds the `colorByAspectKey` map by combining indexed aspects with any aspect keys present on fragments. This is the right layering: the index keeps user-set colours only, the rendering layer fills the rest.
- **Stale `references/TODO.md`, `specifications/navigation.md`, and the two `command-palette.md` files in `git status`** — unrelated work-in-progress, not part of this plan.
