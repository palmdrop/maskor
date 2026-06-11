# Margins fixes — font size, growth, undo-restore, scroll lock + notes relocation

**Date**: 11-06-2026
**Status**: Done <!-- code complete; manual vim-mode browser smoke owed (see Testing) -->
**Specs**: `specifications/margins.md`, `specifications/project-config.md`
**Closed**: 11-06-2026

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

- [x] Create a branch from the plan title. _(2026-06-11 — work continued on the existing `agent/margins-fixes` worktree branch, which already matches the plan title; no new branch.)_
- [x] `git commit` the plan. _(2026-06-11)_

### Phase 1 — Configurable Margin font size (#1)

- [x] Add `marginFontSize` to the `editor` schema (full + partial-update) with the same int/min/max
      idiom as `fontSize` (range 10–22; default `15` in the frontend + storage `PROJECT_CONFIG_DEFAULTS`). _(2026-06-11)_
- [x] Add `"editor.marginFontSize"` to the `useProjectSetting` key union and the `useProjectEditorConfig`
      defaults. _(2026-06-11)_
- [x] Surface a slider in the editor "Aa" popover (`EditorDisplaySettings`); wire commit through the
      same draft/commit path as the other settings. _(2026-06-11)_
- [x] Replace the `MARGIN_FONT_SIZE` constant: `margin-styles` `serifText` → `serifTextStyle(fontSize)`;
      the Margin renders all text (rows, notes, orphans, slot editors) at the configured size, threaded
      `fragment-editor.tsx` → `MarginColumn` → children. Prose `fontSize` stays the geometry trigger. _(2026-06-11)_
- [x] `bun run codegen` (refreshed OpenAPI snapshot + orval client). _(2026-06-11)_
- [x] Tests: registry default round-trip (`15`); margin-column harness passes the configured size. _(2026-06-11)_
- [x] Update `specifications/project-config.md` Shipped. _(2026-06-11)_
- [x] `git commit`. _(2026-06-11)_

### Phase 2 — Margin grows into available space (#2)

- [x] In `entity-editor-shell.tsx`, cap `<main>` on `lg` to `--prose-width` (`maxParagraphWidth`ch at
      the prose font size) via `lg:flex-initial lg:w-(--prose-width) lg:min-w-80` (a min floor, can
      shrink, never grows past prose width), and give the Margin `rightPanel` `lg:flex-1 lg:min-w-80
      lg:max-w-[40rem]`. Non-margin editors keep `flex-1` full-width main. Stacked layout below `lg`
      preserved. _(2026-06-11)_
- [-] Verify behaviour across the `maxParagraphWidth` range / sidebar states — owed to the manual
      browser smoke (jsdom can't measure layout). _(2026-06-11)_
- [x] Tests: existing shell + fragment-editor render tests pass against the new class wiring. _(2026-06-11)_
- [x] `git commit`. _(2026-06-11)_

### Phase 3 — Undo restores dropped anchors (#3)

- [x] Integrate `cmAnchorField` with CM history via `invertedEffects` (added `@codemirror/commands` as
      a direct dep): the pre-edit anchor set is stored on every edit that touches a non-empty set, so
      undo restores a dropped anchor at its exact offset and redo drops it again. `setCmAnchorsEffect`
      gained a `map` so a stored snapshot repositions through intervening changes. Fuzzy rebind stays
      the external-edit recovery path only. _(2026-06-11)_
- [x] Tests (`anchor-cm.test.ts`): delete-paragraph → undo restores the anchor → redo drops it; plus an
      unrelated-edit-then-undo-of-a-drop case. Geometry/caret stay on the manual vim smoke. _(2026-06-11)_
- [x] `git commit`. _(2026-06-11)_

### Phase 4 — Lock the scroller; relocate notes + orphans (#4)

- [x] Restructure `margin-column.tsx` so the synced scroller (`margin-scroll`) contains **only** the
      per-block rows box (height = editor content height), keeping it locked to the editor. _(2026-06-11)_
- [x] Notes moved out of the scroller into a **pinned, always-visible collapsible footer** panel
      (`MarginNotesSection`): toggle always visible, body capped at `max-h-48` with its own scroll; the
      comment column stays locked while notes are open. Default collapsed. _(2026-06-11)_
- [x] Orphan group moved into the pinned footer as a matching collapsible panel (`MarginOrphanGroup`
      gained `open`/`onToggle`; the static `Heading` became a toggle header). Default collapsed. _(2026-06-11)_
- [x] Footer wraps the orphan + notes panels and the controls (`+ Comment`, expand-all) below the
      scroller (`data-testid="margin-footer"`). _(2026-06-11)_
- [x] Tests (`margin-column.test.tsx`): scroller excludes notes/orphans; footer contains them; notes +
      orphan bodies collapse by default and reveal on toggle. _(2026-06-11)_
- [x] Update `specifications/margins.md`: Shipped entry + revised the notes/scroll-sync Behavior bullet
      for the locked-scroller + pinned-footer model. _(2026-06-11)_
- [x] `bun run format` then `bun run verify` — green (typecheck, openapi, backend, frontend 771). _(2026-06-11)_
- [x] Regenerate `references/CODEBASE_SNAPSHOT.md` (`bun run snapshot`; gitignored). _(2026-06-11)_
- [x] `git commit`. _(2026-06-11)_

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
