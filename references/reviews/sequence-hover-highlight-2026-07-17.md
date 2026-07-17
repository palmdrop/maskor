# Review: Overview sequence-position cues, length graph, hover highlight

**Date**: 2026-07-17
**Status**: Resolved
**Scope**: `packages/frontend/src/pages/OverviewPage`, `packages/frontend/src/components/fragments`, `packages/frontend/src/components/sequences`, `packages/frontend/src/lib/commands/scopes`
**Plan**: `references/plans/length-graph.md`, `references/plans/sequence-hover-highlight.md`
**Spec**: `specifications/overview.md`, `specifications/fragment-editor.md`, `specifications/sequencer.md`

---

## Overall

Three related features, reviewed as one body of work: sidebar sequence-position cues + quicker placement (`65cb747`), the summonable length graph (`ab7b13f`), and the cross-surface hover highlight (`910f5f0`). The work is clean, matches both plans and the spec updates, and honors every "out of scope" boundary (no API/schema change, no highlighting in the placement modal, no length enforcement/scoring). The shared-primitive extractions (`useElementWidth`, `GraphSectionsBar`, `ArcPanel` reuse, `FragmentLengthBar`) are correct and reduce duplication rather than adding it. Prop-threading through the deep chains is complete — no missed surfaces. **No behavioral bugs found.** The findings below are test-brittleness, minor duplication, and one stale-topology observation worth surfacing.

The most important correctness point is a *positive* one worth recording: the hover-highlight comparison uses `sequence?.uuid` (the displayed sequence), not `activeSequenceId`. That is the right choice and is what makes "hovered === active → empty" hold in the main-sequence-defaulting case (where `activeSequenceId` is `undefined` but `main` is displayed). See Non-issues.

**Process note (surfacing per CLAUDE.md).** The task framed this as three branch-only commits on top of main, but `main` is now at `65cb747` — the first commit (sidebar cues / placement) has already landed on `main`. Only `ab7b13f` and `910f5f0` are branch-only (`git rev-list main..agent/sequence-hover-highlight` returns two). This review deliberately diffs against `f4f490a` (the parent of `65cb747`) to cover all three as requested. Nothing is wrong with the code; the branch/main topology just differs from the task description. Confirm that landing `65cb747` on `main` before review was intentional.

---

## Bugs

None.

---

## Design

### 1. Row/spine highlight has no semantic test hook — tests pin Tailwind class substrings

`ReorderRow.tsx:116-119`, `FragmentProse.tsx:78`, and the surface/integration tests assert the highlight via `className).toMatch(/ring-2/)` and `/border-primary/`. `ArcPanel` does this the right way — it stamps `data-highlighted` on emphasized circles (`ArcPanel.tsx:88,113`) and the test queries `circle[data-highlighted]`. The row and spine surfaces expose no equivalent attribute, so their tests (and the `OverviewPage` integration test at `OverviewPage.test.tsx:2046-2054`) are coupled to exact utility-class strings. A future restyle of the highlight (ring width, hue, a different Tailwind primitive) would break these tests without any behavior change — or, worse, a partial class rename could leave a test green while the visual is wrong. This is the test-quality weakness the brief asked about: the `ArcPanel` tests genuinely pin behavior; the row/spine/integration ones assert on class-name substrings that can rot.

Fix: add a `data-highlighted={isHighlighted || undefined}` attribute to the `ReorderRow` and `FragmentProse` roots (mirroring `ArcPanel`) and assert on that; keep at most one class assertion for the coexists-with-selection case.

### 2. `SectionData` interface re-declared in three graph components

`ArcOverlay.tsx:11-15`, `LengthOverlay.tsx:14-18`, and `GraphSectionsBar.tsx:4-8` each declare an identical `{ uuid; name; fragmentUuids }` shape (and `computeArcXLayout` declares its own inline structural equivalent). Two of the three copies (`LengthOverlay`, `GraphSectionsBar`) are new in this work. They can't drift silently (TS structural typing keeps the call sites compatible), but a field addition means editing three declarations. Minor structural debt introduced by the extraction.

Fix: export one `SectionData`/`GraphSectionData` type (e.g. from `arcLayout.ts`, which already owns the layout contract) and import it in all three.

---

## Minor

### 3. A hover-highlight unit test is misnamed and doesn't exercise the case it claims

`hoverHighlight.test.ts:49-54` — the test "highlights against the main sequence when no explicit active id is resolved" calls `computeHoverHighlightUuids("secondary", "active", sequences)`, passing a concrete active uuid. It never exercises `activeSequenceUuid === undefined`, so it's a duplicate of the first assertion with a misleading name. The actual "main-defaulting" behavior is covered elsewhere (the active-hover → empty test), so coverage isn't missing — the test just doesn't test what its name says. Rename it, or make it pass `undefined` as the active uuid to genuinely cover the empty-active path.

### 4. `LengthOverlay` recomputes `computeArcXLayout` twice per render

`LengthOverlay.tsx:62-77` computes the x-layout inside the `series` memo, and `GraphSectionsBar` (rendered just below) computes it again from the same `sectionsData`/`width`. `ArcOverlay` already had this double-call pattern, so it's not newly introduced, but the length overlay copies it. The layout is cheap and both are memoized, so this is a note, not a problem — worth folding into a shared memo only if these overlays ever get heavier.

### 5. `computeHoverHighlightUuids` returns a fresh `new Set()` for every empty case

`hoverHighlight.ts:23,24,26` return a new empty `Set` on the not-hovered / active-hover / unknown paths. Because the call is wrapped in `useMemo` in `index.tsx:138`, identity is stable across renders while deps are unchanged, so this causes no extra re-renders in practice. A shared module-level frozen empty set would be marginally tidier (and matches the `EMPTY_HIGHLIGHT_SET` pattern already used in `ArcPanel`/`ReorderList`), but this is cosmetic.

---

## Non-issues

- **Hover comparison uses `sequence?.uuid`, not `activeSequenceId`** (`index.tsx:139`) — this is correct and deliberate. When no sequence is selected in the URL, `activeSequenceId` is `undefined` but `sequence` defaults to `main` (`index.tsx:126-128`). Comparing the hovered id against the *displayed* sequence's uuid is what makes hovering the defaulted-main row correctly clear the highlight. Using `activeSequenceId` here would have highlighted main against itself.
- **`EMPTY_HIGHLIGHT_SET` / `getRelativeLength = () => undefined` module-level defaults** (`ArcPanel.tsx:24`, `ReorderList.tsx:17-18,78`) — intentional stable identities so the placement arranger (which passes no highlight set) doesn't create a new `Set` each render and churn `ReorderRow`s.
- **`LENGTH_SERIES_KEY = "length"` colliding with a user aspect named "length"** — no collision: the length line renders in its own separate panel with its own one-entry color map (`LengthOverlay.tsx:26`); the two graphs never share a series list. The separate-panel decision in the plan is what makes this safe.
- **Imperative `for…of` + array `push` in `buildLengthSeries`** (`lengthData.ts:21-29`) — the `reduce`-over-`for` standard targets object accumulation; this builds an array with two `continue` skips and mirrors the existing `buildArcSeries`. Matching the sibling's style is the right call.
- **Membership list switched from `<Link>` to `<button>`** (`fragment-sequence-membership.tsx:83-95`) — deliberate per the spec: clicking now opens the placement modal instead of navigating. The lost open-in-new-tab affordance is restored by the modal's new "Open in Overview" link.
- **`FragmentLengthBar` floors ratio at `0.015` but `buildLengthSeries` plots ratio 0 at the panel floor** — consistent and intentional: an empty-but-loaded fragment (`content.length === 0`, ratio 0) is a real point (floor of the graph / hairline bar), distinct from an unloaded fragment (absent from the map → omitted). `computeRelativeContentLengths` only omits `undefined` content, never zero-length.
- **`collectSequenceFragmentUuids` does not sort by position** (`hoverHighlight.ts:5-8`) — correct, since its output is only used to build a membership `Set`; order is irrelevant. (The position-sensitive path in `fragment-sequence-membership.tsx:58-62` does sort, as it must.)
- **`SequencePositionIndicator` tick uses `left: %` + `translateX(-%)`** (`fragment-sequence-membership.tsx:26-28`) — correct: keeps the tick inside the track at both extremes (0% → left-aligned, 100% → right-aligned, 50% → centered), matching the three tests.

---

## Resolution

All five findings addressed (2026-07-17):

- **[Design 1]** `ReorderRow` and `FragmentProse` roots now stamp `data-highlighted={isHighlighted || undefined}` (mirroring `ArcPanel`); the row/spine/integration tests assert on that attribute instead of Tailwind class substrings, keeping a single `border-primary` check for the coexists-with-selection case.
- **[Design 2]** A shared `GraphSectionData` type is exported from `arcLayout.ts` and consumed by `ArcOverlay`, `LengthOverlay`, `computeArcXLayout`, and (via boundaries) `GraphSectionsBar`.
- **[Minor 3]** The misnamed test now passes `undefined` as the active uuid, genuinely exercising the empty-active path.
- **[Minor 4]** `ArcOverlay` and `LengthOverlay` compute `computeArcXLayout` once into a memo shared by the series builder and `GraphSectionsBar` (which now takes precomputed `sectionBoundaries` instead of recomputing).
- **[Minor 5]** `computeHoverHighlightUuids` returns a shared module-level `EMPTY_HIGHLIGHT_SET` on its empty paths.

Verify passes (1036 tests). Status: Resolved.
