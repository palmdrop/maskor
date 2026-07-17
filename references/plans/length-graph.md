# Length graph overlay

**Date**: 17-07-2026
**Status**: Done
**Specs**: `specifications/overview.md`
**Closed**: 17-07-2026

---

## Goal

> The Overview page has a summonable "Length" panel, toggled from the sequence header beside "Arcs", that plots each placed fragment's content length (character count, normalized to the longest placed fragment) as a single raw per-fragment smoothed line over the same sequence-index x-axis as the aspect-arcs graph, with the section-boundary bar beneath. It is advisory visual-only — no scoring, no enforcement, no API change. Fragments whose content has not loaded are omitted from the line.

---

## Context

The aspect-arcs overlay already establishes every primitive this feature needs:

- `computeArcXLayout` (`utils/arcLayout.ts`) — x-axis spacing by flattened sequence index, length-agnostic. Reused as-is.
- `ArcPanel` (`components/ArcPanel.tsx`) — renders any normalized 0–1 `ArcSeries[]` as smoothed Catmull-Rom lines with 0/0.5/1 grid lines. Reused as-is.
- `catmullRomPath` / the `ArcSeries` shape (`utils/arcData.ts`) — the line model.
- The section-boundary bar (`SectionsBar` inside `ArcOverlay.tsx`) — one segment per section on the same x-axis.
- `computeRelativeContentLengths` (`utils/relativeContentLengths.ts`) — already produces per-fragment length ÷ longest, omitting unloaded content.
- `contentByFragmentUuid` — already assembled in `OverviewPage/index.tsx` from `useGetSequenceContents`; the arcs overlay does not use it but the spine (and now the placement modal) does.

The overlay is toggled by `arcOverlayOpen` state in `index.tsx`, surfaced as the "Arcs" button in `SequenceHeader.tsx` and the `overview:toggle-arc-overlay` command in `scopes/overview.ts`. The length graph mirrors this wiring with its own state, button, and command.

Design decisions already settled with the developer: **separate panel** (not a line folded into the arcs graph — length is not an aspect weight and must not share that axis), **raw per-fragment line** (not a moving average), **character count** (matches the shipped title-mode length bars so the two agree).

---

## Tasks

### Phase 1 — Length series + panel

- [x] Create branch `agent/length-graph`.
- [x] Add a length-series builder (a small util, e.g. `utils/lengthData.ts`) that turns the ordered fragment uuids + the relative-length map + the x-layout centers + panel height into a single `ArcSeries`-shaped series, mapping each fragment's relative length (0–1) to panel y the same way `buildArcSeries` maps weight. Omit fragments with no loaded content. Reuse the existing `ArcSeries`/`ArcPoint` types rather than inventing parallel ones.
- [x] Add a `LengthOverlay` component mirroring `ArcOverlay`'s shell (heading "Length", Expand/Collapse, Hide, the fit-to-width / expanded-scroll behaviour, the `SectionsBar`), but with a single fixed-color line and no aspect legend. Factor the shared `SectionsBar` + `useElementWidth` out of `ArcOverlay` into a small shared module if that avoids duplication cleanly; otherwise keep `LengthOverlay` self-contained and note the duplication in `references/suggestions.md`.
- [x] Unit-test the length-series builder: normalization to the longest fragment, omission of unloaded fragments, empty-sequence case, single-fragment case.

### Phase 2 — Overview wiring

- [x] Add `lengthOverlayOpen` (and, if expand is supported, `lengthExpanded`) state in `OverviewPage/index.tsx`, a `toggleLengthOverlay` callback, and render `LengthOverlay` next to the existing `ArcOverlay`, fed by `sectionsData`, `fragmentByUuid`, and `contentByFragmentUuid`.
- [x] Add a "Length" toggle button in `SequenceHeader.tsx` beside "Arcs" (same `aria-pressed` styling), threading the new props.
- [x] Add an `overview:toggle-length-overlay` command in `scopes/overview.ts` (and `toggleLengthExpanded` if expand is kept), publish it through the overview scope context, and confirm it reaches the barrel so it appears in the palette and the `CommandId` union.
- [x] Extend the overview scope smoke test to cover the new command(s).
- [x] Commit Phase 1 + 2 together with `git commit`.

### Phase 3 — Spec + verify

- [x] Add a `Shipped` entry to `specifications/overview.md` describing the length graph (advisory, character-count, normalized-to-longest, separate panel). No implementation detail.
- [x] `bun run format` then `bun run verify`; fix any lint/test failures.
- [x] Final `git commit`.

---

## Out of scope

- Any enforcement, scoring, warning, or constraint on length clustering — this is visualization only.
- Moving-average / smoothing overlays, word-count metric, absolute (non-relative) scaling — considered and declined for this slice.
- Folding length into the aspect-arcs graph as a selectable line.
- Any backend, API, or schema change — the data is already client-side.
- A vertical length equivalent of `VerticalArcStrip`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specifically: the length-series builder (normalization, omission, edge counts) and the new overview command(s) via the scope smoke test. The `ArcPanel` rendering itself is already covered and is reused unchanged.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
