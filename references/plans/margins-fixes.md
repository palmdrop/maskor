# Margins fixes — font size, growth, undo-restore, scroll lock + notes relocation

**Date**: 11-06-2026
**Status**: Todo
**Specs**: `specifications/margins.md`, `specifications/project-config.md`

---

## Goal

> Four independent margin fixes land: (1) the Margin text size is a per-project setting adjustable
> from the editor's "Aa" popover; (2) the Margin column grows to absorb the slack when the prose is
> narrowed (editor capped to its prose width with a floor, Margin filling the rest up to a ceiling);
> (3) deleting an annotated paragraph then undoing in vim/raw restores the comment's anchor exactly
> (no silent disappearance); (4) the Margin's synced scroller holds only the per-block rows and stays
> locked to the editor, with notes and orphans moved into a pinned, always-visible footer that expands
> in place without breaking the comment column's scroll-lock.

---

## Background

Established during investigation (2026-06-11):

- **#1** — `MARGIN_FONT_SIZE = 14` is a hardcoded constant in
  `packages/frontend/src/components/margins/slot-editor.tsx`, consumed by `margin-styles.ts`,
  `margin-row.tsx`, `margin-notes-section.tsx`, `margin-orphan-group.tsx`. The Margin only receives the
  prose `fontSize` as a re-measure trigger (`margin-column.tsx`), not its own size. Prose font size is
  already a per-project setting (`editor.fontSize`) — the Margin size should follow the same pattern.
- **#2** — `entity-editor-shell.tsx` (~377–420): `<main>` is `flex-1`, the Margin `rightPanel` is a
  fixed `lg:w-96`. Prose inside `<main>` is `mx-auto` capped at `maxParagraphWidth`ch, so narrowing the
  prose pools empty gutters inside `<main>` instead of letting the Margin grow.
- **#3** — `anchor-cm.ts`: the `cmAnchorField` StateField maps anchors forward and drops one when its
  block fully collapses (`to <= from` → `[]`). The field is **not** part of CodeMirror's undo history,
  so undo restores the document but never the dropped anchor; recovery falls to the best-effort fuzzy
  excerpt rebind (`planOrphanRebinds`, `lib/margins/column.ts`), which silently fails when the
  paragraph opening is not unique — the intermittent "comment disappears" report.
- **#4** — `margin-column.tsx`: the synced scroller (`margin-scroll`) contains the anchored rows box
  (height = editor content height) **plus** the orphan group **plus** the notes section, so the Margin
  scroll content is taller than the editor. `useScrollSync` mirrors `scrollTop`, so the user can scroll
  the Margin past the editor's clamp to reach notes/orphans, desyncing the columns.

Settings plumbing (for #1): the `editor` object schema lives in
`packages/shared/src/schemas/domain/project.ts` (full + partial-update variants); frontend access is
`useProjectSetting` (key union) and `useProjectEditorConfig` (defaults). The schema feeds the OpenAPI
snapshot, so a schema change requires `bun run codegen`.

Developer decisions (2026-06-11): #1 = new `editor.marginFontSize` setting; #2 = cap editor to prose
width with a min-width, Margin `flex-1` with a max-width; #3 = `invertedEffects` history integration;
#4 = synced scroller holds only rows, notes become a pinned always-visible collapsible footer that
expands in place (capped height, own scroll) while the comment column stays scroll-locked, orphans move
to the pinned footer area too.

---

## Tasks

### Phase 0 — Branch + plan

- [ ] Create a branch from the plan title.
- [ ] `git commit` the plan.

### Phase 1 — Configurable Margin font size (#1)

- [ ] Add `marginFontSize` to the `editor` schema (full + partial-update) in
      `packages/shared/src/schemas/domain/project.ts`, with the same int/min/max idiom as `fontSize`
      (default applied in the frontend, ~15).
- [ ] Add `"editor.marginFontSize"` to the `useProjectSetting` key union and the `useProjectEditorConfig`
      defaults.
- [ ] Surface a slider in the editor "Aa" popover (`EditorDisplaySettings`, extracted from
      `entity-editor-shell.tsx`) beside the existing font-size / paragraph-width controls; wire commit
      through the same path.
- [ ] Replace the `MARGIN_FONT_SIZE` constant usages so the Margin renders all text (rows, notes,
      orphans, slot editors) at the configured size; pass it from `fragment-editor.tsx` →
      `MarginColumn`. Keep the prose `fontSize` as the geometry re-measure trigger.
- [ ] `bun run codegen` (schema changed → refresh OpenAPI snapshot + orval client).
- [ ] Tests: setting round-trips (schema default + override); Margin renders at the configured size.
- [ ] Update `specifications/project-config.md` Shipped (new `editor.marginFontSize` setting).
- [ ] `git commit`.

### Phase 2 — Margin grows into available space (#2)

- [ ] In `entity-editor-shell.tsx`, cap `<main>` toward its prose content width (no longer pure
      `flex-1`) with a minimum width floor, and give the Margin `rightPanel` `flex-1` with a maximum
      width ceiling, so narrowing the prose hands the slack to the Margin. Preserve the stacked layout
      on small (`lg:` breakpoint) screens.
- [ ] Verify behaviour across the `maxParagraphWidth` range (narrow → Margin wide up to its ceiling;
      wide → Margin floors at a sensible minimum) and with the sidebar collapsed/expanded.
- [ ] Tests where meaningful (layout class wiring; geometry can't be measured in jsdom — covered by the
      manual smoke).
- [ ] `git commit`.

### Phase 3 — Undo restores dropped anchors (#3)

- [ ] Integrate the `cmAnchorField` with CodeMirror history via `invertedEffects` so an anchor dropped
      (or otherwise changed) by an edit is restored to its exact pre-edit offset on undo, and dropped
      again on redo. The fuzzy excerpt rebind remains the recovery path for genuine external edits, not
      the undo path.
- [ ] Tests (`anchor-cm.test.ts`): delete-paragraph drops the anchor; undo restores it at the original
      offset; redo drops it again; a non-collapsing edit (deleting one soft-wrapped line) is unaffected.
      Geometry/caret stay on the manual vim smoke.
- [ ] `git commit`.

### Phase 4 — Lock the scroller; relocate notes + orphans (#4)

- [ ] Restructure `margin-column.tsx` so the synced scroller (`margin-scroll`) contains **only** the
      per-block rows box (height = editor content height), keeping it the same height as the editor so
      `useScrollSync` stays locked end-to-end.
- [ ] Move the notes section out of the synced scroller into a **pinned, always-visible collapsible
      footer** (sibling of the scroller): the expand toggle shows regardless of scroll position;
      expanding reveals notes in a capped-height, own-scroll area that takes a limited share of the
      column; the comment column above keeps scrolling in lockstep with the editor while notes are open.
- [ ] Move the orphan group into the pinned footer area (out of the synced scroller) — e.g. a
      collapsible "orphaned" affordance alongside notes — so orphans are reachable without desyncing.
- [ ] Reconcile the existing footer controls (`+ Comment`, expand-all) with the new pinned footer
      layout.
- [ ] Tests (`margin-column.test.tsx`): the synced scroller no longer contains notes/orphans; the notes
      toggle is present without scrolling; orphans render in the footer affordance. Update existing
      assertions that expect notes/orphans inside the scroller.
- [ ] Update `specifications/margins.md`: Shipped entry for all four fixes; revise the Behavior bullets
      that state "notes are a collapsible section at the bottom of the column, scrolling with the
      content" and the scroll-sync description to match the locked-scroller + pinned-footer model;
      reconcile the absolute-anchoring / scroll-sync Prior-decision text.
- [ ] `bun run format` then `bun run verify`; fix lint/test failures.
- [ ] Regenerate `references/CODEBASE_SNAPSHOT.md` (`bun run snapshot`).
- [ ] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Geometry, caret position, and real virtualized scrolling cannot be validated in jsdom/happy-dom (per
`references/suggestions.md`). Unit-test the pure/structural pieces: the new setting's schema round-trip
and Margin size wiring (#1), the layout class wiring (#2), the StateField + history invert/restore
logic (#3), and the column structure — synced scroller contents, notes/orphan placement (#4). Pixel/
caret/scroll behaviour (Margin growth at different prose widths; undo preserving caret with no flicker;
notes expanding while the comment column stays locked) lands on a **manual vim-mode browser smoke**.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with
development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit`
and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In progress`.
ALSO update the relevant spec frontmatter — add a `Shipped` item to `specifications/margins.md` (and
`specifications/project-config.md` for the new setting) describing the features implemented (no
granular tasks or implementation detail).
