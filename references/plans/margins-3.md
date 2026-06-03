# Margins III: editor-driven flow alignment & buffer-clean anchoring

**Date**: 02-06-2026
**Status**: In progress
**Specs**: `specifications/margins.md`, `specifications/fragment-editor.md`, `references/adr/0009-buffer-clean-anchoring-and-editor-driven-flow-alignment.md` (new), `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md`, `references/adr/0008-margin-is-an-annotated-paragraphs-column.md`

---

## Goal

> The Margin reads as a flow-aligned annotated-paragraphs column whose rows line up with the fragment's paragraphs **and stay aligned when comments are taller than their blocks** (mutual padding: the editor pushes the next paragraph down for a long comment, the margin pads short ones), driven by a single source of block geometry emitted by the editor; and the fragment **editor buffer holds pure markdown** — `<!--c:ID-->` markers are stripped on load and re-emitted on save, the live comment↔paragraph binding is maintained by mapping anchor positions through editor transactions (deterministic), with index+excerpt fuzzy matching used only as the load/external-edit recovery path.

---

## Context

Iterations 1 (`references/plans/margins.md`) and 2 (`references/plans/margins-2.md`, both Done) shipped the Margin end-to-end and the annotated-paragraphs column, but the alignment is wrong in practice and the in-buffer marker breaks caret behaviour at the end of a paragraph. Root causes, confirmed in the code:

1. **Two block-index spaces.** The margin parses markdown itself (`enumerateBlocks` in `lib/margins/column.ts`) while the editor measures its own DOM nodes (`getBlockHeights` in `prose-editor.tsx`). They diverge — e.g. `# Heading\ntext` (no blank line) is one block to the parser but two nodes to TipTap — so `minHeightFor(row.block.index)` indexes the wrong heights after the first such case.
2. **Only half of flow-alignment shipped.** Margin-side padding exists; document-side padding (Phase 5 of margins-2, deferred) is the half that keeps rows aligned when a comment is taller than its block. Without it, any expanded/long comment drifts every row below it.
3. **Notes header inside the scroll flow** (`margin-column.tsx`, inside `scrollRef`) offsets row 0 from block 0; `scrollTop` mirroring then aligns two non-congruent columns.
4. **In-buffer marker caret breakage.** The `<!--c:ID-->` marker living in the live buffer (hidden by a CM6 decoration / a TipTap `commentMarker` node) makes end-of-paragraph editing awkward; hiding it visually never fixed the caret semantics.

Settled architectural decisions for this iteration (grilling session 2026-06-02, to be recorded in **ADR 0009**):

- **Alignment** keeps ADR 0008's flow-padding goal but refines the implementation: the **editor is the single source of truth for block enumeration and geometry**, emitting `blocks[] = { markerId | null, top, height }`; the margin renders one row per entry and binds by `markerId`. Mutual flow padding (`rowHeight = max(block.height, commentHeight)`): margin-side padding for short comments, **document-side spacer** (decoration/widget, never buffer text) for long ones. Keep **two scrollers with `scrollTop` mirroring** (a single physical scroller breaks CM6/vim internal scrolling and large-doc perf); congruent geometry makes mirroring exact. Notes header moves out of the scrolled flow.
- **Anchoring** moves the marker out of the **editor buffer** (pure markdown shown; markers stripped on load, re-emitted on save) but keeps it **on disk** (invisible in rendered markdown/Obsidian; backend storage/DB/export-strip/orphan-detection unchanged). Live binding = **position-mapping through transactions** (ProseMirror `tr.mapping`; CM6 `StateField.map(tr.changes)`). **Fuzzy (index + excerpt) is recovery-only** — file load and external-edit/whole-doc-replace, where degradation is accepted. **Swap stores anchor positions** so the linked fragment+Margin pair rebinds precisely on crash recovery.

Current touch-points (orientation, not prescription): `packages/frontend/src/components/margins/` (`margin-column.tsx`, `slot-editor.tsx`, `comment-card.tsx`), `lib/margins/column.ts` + `excerpts.ts`, `prose-editor.tsx` (`getBlockHeights`, `getScrollElement`, `getCurrentBlock`, `insertCommentMarkerInBlock`, `stripCommentMarker`, `blockRanges`, marker methods), `entity-editor-shell.tsx`, `fragment-editor.tsx`, `hooks/useMarginEditor.ts`, `comment-marker-cm.ts`, the TipTap comment-marker extension.

---

## Tasks

Phases are ordered so each is independently committable and leaves the app working. Phase 0 records the decision. Phases 1–2 establish the editor-driven geometry and the position-anchor model (the foundations everything else rests on). Phase 3 is the buffer-clean cutover and the removal of the old in-buffer marker machinery. Phase 4 is the alignment rebuild (margin-side + document-side padding). Phase 5 wires recovery (load fuzzy fallback + swap anchors). Phase 6 is reconciliation.

### Phase 0 — Branch, ADR & groundwork

- [x] Create branch `agent/margins-3` based on this plan title. (Worktree `.worktrees/margins-3` already on `agent/margins-3`.) _(2026-06-02)_
- [x] Write **ADR 0009** (`references/adr/0009-buffer-clean-anchoring-and-editor-driven-flow-alignment.md`): records (a) editor-driven flow alignment refining ADR 0008, and (b) buffer-clean anchoring with position-mapping + fuzzy-recovery, superseding ADR 0007's "marker lives in the buffer" aspect (the on-disk marker as durable anchor is retained). Cross-reference ADR 0007/0008. _(2026-06-02)_
- [x] Note in ADR 0008 / `specifications/margins.md` the prior decisions that 0009 supersedes (in-buffer marker rendering; the margin's independent block enumeration). Spec text only — no behaviour change in this phase. _(2026-06-02)_
- [ ] Commit (docs only).

### Phase 1 — Editor as the single source of block geometry

- [x] Add a `getBlocks()` handle to `prose-editor.tsx` returning the authoritative `{ markerId | null, text, top, height }[]` in document order — `top`/`height` measured from the real editor DOM (CM6 `coordsAtPos` for block ranges; TipTap `nodeDOM` per top-level node), `markerId` from the editor's own block scan (a Phase-1 bridge: still reads the in-buffer marker; Phase 2 swaps the source to the anchor model). Surfaced through `entity-editor-shell.tsx`. _(2026-06-02)_
- [x] Margin column renders **one row per `getBlocks()` entry** and binds comments by `markerId`. The margin's independent `enumerateBlocks` parse is gone from the render path (kept only as the editor-less test-harness fallback). `getBlockHeights` replaced by the unified source. _(2026-06-02)_
- [x] Re-measure on edit / resize / mode-change via `ResizeObserver` + rAF-batched `geometryTick`; block count/order match the editor (the `getBlocks()` list is the only structural source). _(2026-06-02)_
- [x] Moved the **notes header out of the scrolled flow** (a pinned `shrink-0` sibling above the scroller) so margin row 0 aligns with block 0. _(2026-06-02)_
- [x] Tests: column renders one row per `getBlocks()` entry where the editor's count differs from a blank-line parse (heading-without-blank-line); binds by `markerId`; notes header is not nested in the scroller. (Real `top`/`height` geometry deferred to a manual smoke test.) _(2026-06-02)_
- [ ] Commit.

### Phase 2 — Position-anchor model (live binding via transaction mapping)

- [x] Per-editor **anchor model**: a ProseMirror plugin (`anchor-tiptap.ts`, mapping positions through `tr.mapping`) and a CM6 `StateField` (`anchor-cm.ts`, mapping offsets through `tr.changes`). Each exposes block-index resolution + a dot cue; the `ProseEditor` handle's existing marker methods now drive them. _(2026-06-03)_
- [x] On load, anchor positions are derived from the stored markers and the **buffer is presented marker-free** — rich parses markers into transient `commentMarker` nodes then strips them to mapped positions (`extractTiptapAnchors`); raw/vim shows `splitCommentMarkers().clean` and seeds the offsets. _(2026-06-03)_
- [x] Binding (`markerId` ↔ block) reads from the anchor model's mapped positions (`getBlocks`/`getCurrentBlock` markerId), so a moved/edited block carries its anchor. _(2026-06-03)_
- [x] Tests: `anchor-cm.test.ts` + `anchor-tiptap.test.ts` — anchors map through an edit in an earlier block and stay bound; load strips markers (clean buffer); re-emit round-trips. _(2026-06-03)_
- [x] Commit (with Phase 3 — the cutover is atomic). _(2026-06-03)_

### Phase 3 — Buffer-clean cutover: strip in buffer, re-emit on save; remove old marker machinery

- [x] **Save path**: `getContent` re-emits `<!--c:ID-->` at each anchor's mapped position (`serializeTiptapWithMarkers` / `insertCommentMarkers`), producing the on-disk form. The edited buffer never contains markers. The swap mirrors `getContent`, so markers travel in the swapped content. _(2026-06-03)_
- [x] **Type-to-create / delete** are anchor-model operations (no buffer mutation): add/remove the anchor + fire `onChange` so the fragment dirties (marker re-emits on save). Orphan-delete is a no-op on the fragment side. _(2026-06-03)_
- [x] **Removed** `comment-marker-cm.ts` and the "show source" toggle (`editor:toggle-show-source`, shell UI, editor-scope command + its test). The TipTap `commentMarker` node is **kept** as the transient load/save parse vehicle. Dot cue now driven by the anchor store (CM line class / PM node decoration). _(2026-06-03)_
- [x] `prose-editor.tsx` marker methods (`getCurrentBlock`, `insertCommentMarkerInBlock`, `stripCommentMarker`, `reveal`, `focus`, `getBlocks`) operate against the anchor model; names kept (legacy) with updated comments — noted in suggestions.md. _(2026-06-03)_
- [x] Tests: anchor-model load/clean-buffer/re-emit covered (`anchor-*.test.ts`); `commentMarker` node round-trip retained; export/preview strip + full backend suite still green via `bun run verify`. (Real end-of-paragraph caret behaviour is a manual smoke test.) _(2026-06-03)_
- [x] `specifications/fragment-editor.md` / `margins.md`: buffer-clean + on-disk + dot-cue-from-anchors Shipped entries and prior-decision updates. _(2026-06-03)_

### Phase 4 — Flow alignment rebuild (margin-side + document-side padding)

- [x] **Mutual padding.** Per row, `rowHeight = max(block.height, commentHeight)`, derived from **natural** (spacer-excluded) measurements (`naturalSlotHeights` backs out the current spacer) so the measure→compute→apply pass converges. Margin side pads comments shorter than their block via the computed `minHeight`. _(2026-06-02)_
- [x] **Document-side spacer.** A TipTap widget decoration (`block-spacer-tiptap.ts`, meta-only transaction) and a CM6 block widget (`block-spacer-cm.ts`, effect-only dispatch) inject vertical space below a block whose comment is taller — height only, never buffer text or serialization. `ProseEditor.setBlockSpacers` drives both; re-measured on edit/resize/mode-change. _(2026-06-02)_
- [x] **Very-tall-comment cap.** A collapsed comment is clipped to ~3 lines (line-clamp); a single spacer is capped at `MAX_SPACER` for safety; focused/expanded is intentionally uncapped within that bound. _(2026-06-02)_
- [x] **Congruent scroll.** Two scrollers with `scrollTop` mirroring retained (no single physical scroller); congruence comes from the unified block source + notes header out of flow + inherited rhythm (rows keyed off measured tops) + spacers. _(2026-06-02)_
- [x] `specifications/margins.md`: replaced the margin-side-only behaviour with shipped mutual padding; Shipped entry (→ ADR 0009). _(2026-06-02)_
- [x] Tests: pure alignment math (`alignment.test.ts` — pad/spacer/convergence/cap/natural-slot/epsilon) + a column wiring test that stubs row geometry and asserts `setBlockSpacers([140, 0])`. **Manual smoke test in rich and vim/raw still required for the real decoration geometry.** _(2026-06-02)_
- [x] Commit. _(2026-06-02 — commit 88d5827)_

### Phase 5 — Recovery: load fuzzy fallback & precise swap anchors

- [x] **Fuzzy recovery path** (`planOrphanRebinds` in `lib/margins/column.ts`): an orphan whose last-known excerpt uniquely matches an un-anchored block re-anchors to it (against the editor's own blocks — same index space; conservative, no silent mis-binding; self-terminating). Unmatched → orphan with frozen excerpt. _(2026-06-03)_
- [x] **Swap stores anchor positions — precisely, via the content round-trip.** Because `getContent` re-emits markers and the swap mirrors `getContent`, the swapped content carries the markers; on restore `setContent` strips+seeds them, rebinding anchors exactly (no separate JSON needed). Single banner and atomic revert unchanged. _(2026-06-03)_
- [x] Tests: `planOrphanRebinds` (unique match / no-match / no-steal-anchored / no-double-bind); the swap round-trip is the split/insert byte-stable test + the load/re-emit anchor tests. (Live crash/reopen is a manual smoke test.) _(2026-06-03)_
- [x] `specifications/margins.md` / `fragment-editor.md`: Shipped entries for the recovery model + swap anchors. _(2026-06-03)_

### Phase 6 — Final reconciliation

- [ ] `bun run format` then `bun run verify`; fix lint/test/codegen-sync failures. (No API route changes expected — confirm; run `bun run codegen` only if a route schema moved.)
- [ ] Sweep touched specs for Shipped accuracy and Status; ensure ADR 0009 cross-references ADR 0007/0008 and the superseded prior decisions are annotated.
- [ ] Update `references/CODEBASE_SNAPSHOT.md` (`bun run snapshot`); add any surprises to `references/suggestions.md`; tick resolved `references/TODO.md` Margins items (document-side padding).
- [ ] Set this plan's Status to `Done` (or `In progress` if partial); set `Closed` date.
- [ ] Final commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Priority test targets: unified block source matches the editor's block count/order (heading-without-blank-line, lists, blockquotes); anchor position-mapping through inserts/deletes/paragraph-moves; load strips markers from the buffer while preserving anchors; save re-emits markers byte-compatibly with the backend parser; type-to-create / delete leave the buffer marker-free until save; mutual padding keeps the next row aligned when a comment is taller than its block; fuzzy recovery on external edit / whole-doc replace; precise anchor rebind from swap on crash/reopen. The real-editor marker/padding geometry is hard to assert in jsdom/happy-dom — cover the pure logic in unit tests and call out a manual smoke test of both editor modes (rich + vim/raw).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Cross-cutting: ADR 0009 is the source of truth for this iteration's interaction/anchoring model; it refines ADR 0008 (layout) and supersedes ADR 0007's in-buffer-marker aspect (the on-disk marker is retained as the durable, portable anchor). The on-disk format, backend storage/DB index, export/preview marker-strip, and orphan detection are **unchanged** — this iteration is frontend editor/column work. Phases 1–2 (geometry source + anchor model) are foundations; do not start Phase 4 alignment before they land.
