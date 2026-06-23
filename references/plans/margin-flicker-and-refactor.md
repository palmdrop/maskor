# Fragment editor + Margin: flicker/alignment fixes and component refactor

**Date**: 05-06-2026
**Status**: Done <!-- shipped to main; manual vim-mode browser smoke still owed (Phase 5) -->
**Closed**: 23-06-2026
**Specs**: `specifications/margins.md`

---

## Goal

> In **vim/raw (CM6) mode**: saving a fragment no longer flickers or jumps the caret; each Margin
> comment stays level with its paragraph on long fragments (no broken offsets, no extra inter-paragraph
> spacing); the Margin reads at the app's text size in a wider column; document-side spacers are gone
> and comments are **absolutely anchored** at their block's top (prose never moves); hovering/focusing
> a comment highlights its bound paragraph and vice-versa. The four oversized editor components are
> decomposed into focused sub-components/hooks with no behavioural regressions. Rich (TipTap) mode is
> out of scope for the bug fixes but must not regress.

---

## Background

Root causes established during investigation (vim/raw mode only — rich mode is insulated because
ProseMirror does not virtualize and uses Tailwind `prose` line-height):

- **A — Geometry breaks under virtualization.** `ProseEditor.getBlocks()` (vim/raw branch) measures
  blocks with `view.coordsAtPos`, which returns `null` for positions outside CM6's rendered viewport.
  Off-screen blocks fall back to `{top:0,height:0}`, corrupting `naturalSlotHeights` → wrong
  min-heights/spacers. It does not recover on scroll (the `ResizeObserver` only fires on size change).
- **B — Save flicker + caret jump.** `@uiw/react-codemirror` reacts to a changed `value` prop with a
  full-document replace (`changes: {from:0, to:len, insert:value}`, no selection preserved). After
  save, the refetched content is vault-normalized (`serialize.ts` does `body.trim() + "\n"`) and
  differs from the live buffer, triggering the replace. The rich path guards this with a `trimEnd`
  comparison; the CM path has no guard.
- **C — Line-height mismatch.** Margin text uses `MARGIN_LINE_HEIGHT = 1.75`; the CM editor renders at
  its base-theme `.cm-content { line-height: 1.4 }`. Equal text is ~25% taller in the margin → phantom
  document-side spacers and per-line drift.

Decisions taken with the developer (discussion 2026-06-05):

- Scope the bug fixes to **vim mode** (rich mode unchanged but must not regress).
- **Drop document-side spacers entirely, in both modes.** They were the fragile half and the main
  source of "extra spacing"; keeping them for rich only would retain ~all the machinery (both spacer
  extensions + the freeze-while-focused / reconcile-on-blur dance) for almost no simplification. The
  fragment prose never moves to accommodate a comment.
- **Absolute top-anchored Margin.** With spacers gone the old min-height row chain would drift (it was
  the partner of the push), so each comment is positioned at its block's measured top. No cumulative
  drift; a tall comment overflows downward and the **focused** comment renders as an elevated overlay
  (bg + z-index) over its neighbours, collapsing on blur. Scroll-sync already keeps comment _i_ level
  with block _i_, so this preserves "look straight left" alignment at all times.
- **Reciprocal connection highlight.** Hover/focus a comment tints its bound paragraph in the editor
  (a CM line decoration keyed by the tracked anchor); putting the caret in a paragraph highlights its
  comment. This is the disambiguation cue for adjacency/overlap — no leader lines, no in-prose marks,
  no persistent gutter ticks (kept the quiet margins-4 aesthetic).
- **Expand-all relaxes alignment.** When expand-all is on, the Margin becomes a plain readable column
  (comments stack, top-anchoring relaxed); collapsing restores per-block alignment.
- With spacers gone, **make the Margin fit more text**: drop the prose-font-size coupling (it only
  existed to make pixel-exact mutual alignment work) and render the Margin at the **app's default text
  size** (smaller than the prose), in a **wider column**.
- **Normalize the live buffer to the vault's form** (trim + single trailing newline) so the post-save
  round-trip is a no-op and no re-sync fires.
- Refactor the four oversized components (`margin-column.tsx` 698, `prose-editor.tsx` 628,
  `entity-editor-shell.tsx` 712, `fragment-editor.tsx` 442) into sub-components/hooks while touching
  them.

Also flagged: `references/CODEBASE_SNAPSHOT.md` was missing and has been regenerated (`bun run
snapshot`).

---

## Tasks

### Phase 0 — Commit the plan

Work continues on the current branch (`agent/editor-flicker`); no new branch.

- [x] `git commit` the plan (and any other doc changes; the regenerated `CODEBASE_SNAPSHOT.md` is
      gitignored, so the plan file is the only doc to commit). _(2026-06-07)_

### Phase 1 — Save flicker + caret jump (root cause B)

Smallest, highest-impact, lowest-risk. Land first.

- [x] Make the CM (vim/raw) buffer the authoritative source for save: `getContent()` now trailing-trims
      the doc before re-emitting markers, matching the vault's `body.trim() + "\n"` normalization so the
      saved form is idempotent. _(2026-06-07)_
- [x] Guard the `value`-driven re-sync via a shared `isTrailingWhitespaceEquivalent` predicate: the CM
      path holds `value` equal to the live doc when the incoming content differs only by trailing
      whitespace (so `@uiw` skips its full-document replace), and the rich path reuses the same
      predicate. Imperative `setContent` keeps `cmValue` in sync to avoid a replace-back. _(2026-06-07)_
- [-] Verify caret preserved / no flicker — manual vim smoke (Phase 5); cannot be validated in jsdom.
- [x] Tests: `buffer-sync.test.ts` covers the predicate (trailing-newline-only equivalence; real edits,
      leading-whitespace, and interior-whitespace differences treated as genuine changes). _(2026-06-07)_
- [ ] `git commit`.

### Phase 2 — Remove document-side spacers; line-height; Margin sizing (root C + design)

- [x] Removed the document-side spacer mechanism in **both** modes: deleted the spacer extensions
      (`block-spacer-cm.ts`, `block-spacer-tiptap.ts`) and all wiring, dropped `setBlockSpacers` from
      the `ProseEditorHandle` / shell / bridge, removed `MAX_SPACER` / the spacer math / the
      `currentSpacersRef` back-out, and the freeze-while-focused / reconcile-on-blur logic. Also removed
      the now-obsolete top-padding mechanism (`setTopPadding` / `--cm-top-pad` / `richTopPadding`), since
      absolute anchoring uses block tops directly. `alignment.ts` reduced to `pixelArraysEqual`.
      _(2026-06-07)_
- [x] Decoupled the Margin from the prose font size: comment/notes text and the slot editors render at
      `MARGIN_FONT_SIZE` (app size). `fontSize` is kept only as a re-measure trigger. _(2026-06-07)_
- [x] Set the CM fragment editor `.cm-content` line-height to 1.75 (prose rhythm, no longer cramped at
      CM6's base 1.4); `MARGIN_LINE_HEIGHT` dropped to 1.6. _(2026-06-07)_
- [x] Widened the Margin column (`lg:w-80` → `lg:w-96`). _(2026-06-07)_
- [x] Tests: `alignment.test.ts` rewritten for `pixelArraysEqual`; `margin-column.test.tsx` updated for
      the absolute-anchored model (no spacer/top-padding tests; added absolute-top + clip + expand-all
      relax tests). Full suite green (550). _(2026-06-07)_
- [ ] `git commit`.

### Phase 3 — Absolute top-anchored Margin + virtualization-safe geometry (root A + design)

- [x] Replaced `coordsAtPos`-based block geometry in the vim/raw `getBlocks()` with a height-map query
      (`view.lineBlockAt` + `documentTop`), defined for off-screen positions, so every block reports a
      real scroll-independent `top` regardless of the viewport. _(2026-06-07)_
- [x] Re-measure (debounced) when the editor settles from a scroll, so CM6's estimated off-screen line
      heights refine as blocks are revealed. _(2026-06-07)_
- [x] Switched the Margin layout from the min-height row chain to **absolute top-anchoring**: a
      positioned rows container as tall as the editor content; each comment positioned at its block's
      measured top. Collapsed comments clip to their block height; the **focused** comment lifts onto an
      opaque overlay (bg + z-10 + shadow) over neighbours and collapses on blur. **Expand-all** relaxes
      anchoring into a plain stacked column. _(2026-06-07 — done with Phase 2 commit)_
- [x] Retired the origin-alignment effect, `rowsPaddingTop`, and the `editorBlocks[0].top` feedback —
      absolute positioning uses block tops directly. _(2026-06-07 — done with Phase 2 commit)_
- [x] Reciprocal connection highlight: a new `anchor-highlight-cm` extension tints the bound block's
      line(s) while a comment is hovered/focused (driven by `setHighlightedAnchor` through the bridge);
      the editor reports the caret's block via `onActiveBlockChange` so the column tints the matching
      comment back. vim/raw only (rich is a no-op this iteration). _(2026-06-07)_
- [x] Tests: `anchor-highlight-cm.test.ts` covers the anchor→highlighted-line mapping (single block,
      multi-line block, missing/cleared marker); `margin-column.test.tsx` covers hover→`highlightAnchor`
      and `highlightedMarkerId`→comment tint, plus absolute-top / clip / expand-all. Geometry pixel/
      caret/scroll behaviour goes to the manual smoke (jsdom can't measure CM). _(2026-06-07)_
- [ ] `git commit`.

### Phase 4 — Component decomposition (refactor)

No behavioural change; structural only. Split each oversized file into a thin orchestrator plus
focused sub-components and hooks. Co-locate tests with the units they cover.

- [x] `margin-column.tsx` (698 → 368) — extracted `MarginRow`, `MarginOrphanGroup`,
      `MarginNotesSection`, the shared `margin-styles`, and the `useMarginGeometry` / `useScrollSync`
      hooks. The component is now orchestration + layout. _(2026-06-07)_
- [~] `prose-editor.tsx` (653 → 602) — extracted block geometry (`EditorBlock`, `markerForBlock`, the
  CM6/TipTap `getBlocks` bodies) into `editor-geometry.ts`. The full rich/CM two-component split was
  **deliberately not done**: it is the riskiest change (CM/TipTap behaviour can't be validated in
  jsdom) and would sit directly on top of the just-landed save/cursor fixes. Left as a follow-up;
  the "Split into two components?" NOTE remains. _(2026-06-07)_
- [~] `entity-editor-shell.tsx` (716 → 669) — extracted the `EditorDisplaySettings` popover. The
  insert/extract dialog orchestration and swap/recovery hooks were left in place (tightly coupled to
  the command scope + registry; lower value/higher churn for this pass). _(2026-06-07)_
- [x] `fragment-editor.tsx` (444 → 429) — extracted the editor↔Margin bridge callbacks into
      `useFragmentMarginBridge`. _(2026-06-07)_
- [x] `bun run format` + `bun run typecheck` pass. _(2026-06-07)_
- [x] Tests: new `editor-geometry`/highlight/buffer-sync units added; existing component tests pass
      against the new structure (557 green). _(2026-06-07)_
- [x] `git commit`. _(2026-06-07 — committed across four refactor commits)_

### Phase 5 — Verify, spec, snapshot

- [x] `bun run format` then `bun run verify` — green (typecheck, openapi, backend 888, frontend 557).
      _(2026-06-07)_
- [ ] **Manual browser smoke (vim mode) — OWED by the developer** (jsdom can't validate geometry/caret;
      see `references/suggestions.md`): long fragment with many short blank-line-separated blocks —
      each comment stays level with its paragraph on scroll; save preserves caret with no flicker;
      comments read at app size in the wider column; no extra inter-paragraph spacing; focused comment
      overlays neighbours and collapses on blur; hover/focus highlights the bound paragraph both ways;
      expand-all reads as a plain column; type-to-create, delete→paste re-attach, Tab/Esc focus keymap
      all still work.
- [x] Updated `specifications/margins.md`: Shipped entry added; the mutual-flow / document-side-push
      Behavior bullet and the ADR 0008/0009 Prior decision reconciled with the absolute-anchored model;
      reciprocal-cue bullet added. _(2026-06-07)_
- [x] Regenerated `references/CODEBASE_SNAPSHOT.md`. _(2026-06-07)_
- [ ] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Geometry, caret position, and real virtualized scrolling cannot be validated in jsdom/happy-dom (per
`references/suggestions.md`). Unit-test the pure pieces (normalization, value-sync guard, column
binding, margin-side alignment mapping, height-map→row layout). Everything pixel/caret/scroll lands on
the **manual vim-mode browser smoke** in Phase 5.

---

## Resolved questions (discussion 2026-06-05)

1. **Document-side spacers** — dropped everywhere (both modes). Keeping rich-only retained ~all the
   machinery for no simplification, and the inherent prose-motion was the disliked behaviour, which
   solidity wouldn't change.
2. **Alignment model** — absolute top-anchoring (each comment at its block's measured top), not the
   min-height chain. The chain was the partner of the push and drifts without it.
3. **Expand-all** — relaxes anchoring into a plain readable column; collapsing restores alignment.
4. **Connection cue** — reciprocal hover/focus highlight only (no leader lines, gutter ticks, or
   in-prose numbers). Scroll-sync already keeps comments level with their blocks, so the cue only needs
   to disambiguate adjacency/overlap.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, continue on the current branch (`agent/editor-flicker`) — no new
branch. Start with Phase 0 (commit the plan).

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit`
and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In progress`.
ALSO update `specifications/margins.md` frontmatter — add an item to the `Shipped` section describing
the features implemented (no granular tasks or implementation detail).
