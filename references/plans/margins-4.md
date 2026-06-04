# Margins IV: smoke-test fixes — font, seamless layout, save coupling & two anchor bugs

**Date**: 04-06-2026
**Status**: Done
**Closed**: 04-06-2026
**Specs**: `specifications/margins.md`, `specifications/fragment-editor.md`, `references/adr/0009-buffer-clean-anchoring-and-editor-driven-flow-alignment.md`

---

## Goal

> The Margin reads as a **seamless serif column** flush to the top of the fragment editor (no initial vertical offset): comments are plain flowing text tied to their paragraph by a thin top rule, boxed with a faint border only while editing; notes and column controls live at the **bottom**; the editor's own save persists fragment + margin together (no separate margin Save button); typing the first character of a new comment no longer remounts the editor (vim mode and content preserved); the fragment document stays **still while you type a comment** and reconciles its push on blur; and deleting a paragraph then pasting it back **re-attaches** its orphaned comment.

---

## Context

`margins-3` (ADR 0009) shipped buffer-clean anchoring + editor-driven mutual flow alignment. A manual smoke test (`references/reviews/margins-findings-2026-06-04.md`) surfaced font, layout, styling, save-coupling, and two interaction/anchor bugs. This iteration pays them down. Two design decisions were settled in discussion:

- **Freeze the document while editing a comment** — no per-keystroke push; the document-side spacers reconcile on blur (finding #6).
- **No initial top offset in the fragment editor** — remove the margin's top chrome so the existing origin-alignment effect pads the _margin_ down to meet the editor's first line (the `rowsPaddingTop` branch), leaving `editorTopPadding` at 0 (findings #3, #4).

Touch-points (orientation, not prescription): `packages/frontend/src/components/margins/` (`margin-column.tsx`, `slot-editor.tsx`, `comment-card.tsx`); `prose-editor.tsx` (origin alignment, `getContent`/`setContent`, spacer/anchor wiring); `anchor-cm.ts`, `anchor-tiptap.ts` (deletion detection); `block-spacer-cm.ts`, `block-spacer-tiptap.ts`; `entity-editor-shell.tsx`, `fragments/fragment-editor.tsx` (save coupling, dirty); `hooks/useMarginEditor.ts`; `styles/global.css`. ADR 0009 is the model of record.

---

## Tasks

Phases are independently committable and leave the app working. Order: quick font win first; then the layout/styling restructure (biggest visual change); then save coupling; then the two interaction fixes; then the orphan bug; then reconcile. jsdom cannot validate real editor geometry/caret — pure logic gets unit tests, the rest is called out for a manual smoke test.

### Phase 0 — Branch & groundwork

- [x] Verify that you are in a branch named `agent/margins-4`. If not, stop immediately.
- [x] No spec/behaviour change in this phase. Commit only if anything is outstanding.

### Phase 1 — Serif font in the Margin (#1, #2)

- [x] Apply the editor's serif family (`var(--font-serif)`) and matching line-height to the Margin's static comment/notes text and to both `SlotEditor` variants (the raw/vim slot is currently `font-mono`; the rich slot inherits sans). Keep the existing `fontSize` propagation.
- [x] Verify finding #2 (multi-line comments offsetting alignment) is resolved by the font/line-height match — the document-side push is measured, so equal line-heights should remove the drift. If residual drift remains, note it for Phase 5/manual smoke.
- [x] `specifications/margins.md`: Shipped note (font parity). Tests: none meaningful in jsdom (geometry) — covered by manual smoke. Commit.

### Phase 2 — Seamless layout: top-flush editor, notes & controls at the bottom (#3, #4)

- [x] Remove the Margin's **top toolbar**; the scroller starts at the column top with no chrome, so the origin-alignment effect pads the margin rows down to the editor's first paragraph and the fragment editor keeps **zero** top offset (`editorTopPadding` resolves to 0).
- [x] Move the **Notes** section to the **bottom** of the margin scroller — it scrolls with the content and is reached only after scrolling past the fragment text.
- [x] Move the column **controls** (expand-all; the "+ Comment" jump) to the **bottom** of the margin column as a pinned footer.
- [x] Confirm the editor content itself has no first-line top gap (the prior chrome-matching is now a margin-side pad only).
- [x] `specifications/margins.md`: update the "notes are a pinned header at the top" surface description to bottom-placed notes/controls; Shipped entry. Tests: update/extend the margin-column tests for notes-at-bottom and no top toolbar. Commit.

### Phase 3 — Seamless styling: flowing text, edit-only border, attachment rule, separator (#8, #9, #11, #12)

- [x] Remove the per-comment **box**: the left border (`border-l-2`), the left padding (`pl-3`), and the reveal guide-line button. Comments render as plain flowing serif text — a seamless column.
- [x] Show a **faint border only on the focused/editing comment** (it reads as a box only while editing).
- [x] Add a thin **horizontal rule along the top edge** of each comment, which (via alignment) sits level with the top of its bound paragraph — the attachment cue (replaces the removed left guide line). Final look to be confirmed on screen.
- [x] Add a **faint vertical separator with padding** between the fragment editor and the Margin so the two read as two seamless pieces of text.
- [x] `specifications/margins.md`: update the surface styling description; Shipped entry. Tests: assert the idle comment has no box border and the active one does; the attachment rule renders. Commit.

### Phase 4 — Save coupling: editor save persists fragment + margin (#10, #13)

- [x] Remove the Margin **Save button** as a separate user action. The fragment editor save (`editor:save` / `:w` / `mod+s` / the editor Save button) saves the **fragment and the margin together**. (`margin:save` may remain as the internal mechanism the coupled save invokes.)
- [x] The Margin's **dirty** state contributes to the shell's dirty indicator and gates the editor Save button, so a margin-only edit is saveable from the editor.
- [x] Preserve the linked swap pair and the single recovery banner (unchanged); only the explicit-save path is coupled.
- [x] `specifications/margins.md` / `fragment-editor.md`: update the "explicit save for both" decision to a single coupled save; Shipped entries. Tests: editor save triggers both fragment and margin persistence; margin-only dirtiness enables the editor save. Commit.

### Phase 5 — Type-to-create without remount (#5)

- [x] Render **one persistent editor per active slot** with a stable React key across the draft→comment transition: the first non-empty keystroke mints the marker + comment, but the same `SlotEditor` instance keeps editing (swap value/onChange, do not switch JSX branch), so CM/vim mode and the caret survive — no reload, no drop back to normal mode, no layout jump.
- [x] Keep "untouched slot creates nothing" (focus alone creates no comment; creation is still first-keystroke).
- [x] `specifications/margins.md`: Shipped note. Tests: type-to-create still injects the anchor + seeds the comment on first input and does not on empty (existing assertions hold against the unified editor); the remount itself is a manual smoke (vim mode preserved). Commit.

### Phase 6 — Freeze the document while editing (#6)

- [x] While a comment/slot is **focused**, freeze the document-side spacers at their current values — the focused comment may grow within the Margin, but the fragment paragraph padding does not change per keystroke.
- [x] On **blur** (focus leaves the slot), recompute and reconcile the document-side spacers to the settled comment height.
- [x] Margin-side row heights may still reflect the live comment; only the **document push** is frozen during editing. Keep the convergence guards (`spacersEqual`) so the reconcile is a single settle.
- [x] `specifications/margins.md`: Shipped note (freeze-while-editing). Tests: the alignment pass skips document-spacer updates while a slot is active and applies them on blur (pure-logic where possible; geometry via manual smoke). Commit.

### Phase 7 — Drop anchors on block deletion so orphan + re-attach works (#7)

- [x] Detect deletion when mapping anchors: ProseMirror `tr.mapping.mapResult(pos).deleted` in `anchor-tiptap.ts`; CM6 `tr.changes.mapPos(offset, -1, MapMode.TrackDel)` (returns `< 0`) in `anchor-cm.ts`. **Drop** an anchor whose position was deleted instead of collapsing it to the deletion boundary (which mis-binds it to an adjacent block).
- [x] Result: deleting a paragraph **orphans** its comment; pasting the paragraph back lets `planOrphanRebinds` re-attach by excerpt. Verify the end-to-end path (delete → orphan → paste → rebind).
- [x] `specifications/margins.md`: Shipped note (deletion drops the anchor; recovery rebinds). Tests: `anchor-cm.test.ts` / `anchor-tiptap.test.ts` — deleting the range containing an anchor drops it (no mis-bind to the neighbour); the existing mapping-through-edit tests still pass. Commit.

### Phase 8 — Final reconciliation

- [x] `bun run format` then `bun run verify`; fix lint/test/codegen-sync failures (no API route changes expected).
- [x] Sweep touched specs for Shipped accuracy and Status; keep ADR 0009 the model of record (no ADR change expected — these are refinements).
- [x] Regenerate the snapshot; resolve the addressed `references/reviews/margins-findings-2026-06-04.md` items (annotate as fixed); add any new surprises to `references/suggestions.md`.
- [x] Set this plan's Status to `Done` (or `In progress` if partial); set `Closed` date.
- [x] Final commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Priority test targets: deletion drops an anchor (no mis-bind to the neighbouring block) so the orphan + fuzzy-rebind path runs; type-to-create still injects the anchor and seeds the comment on first input (and not on empty) against the unified single-editor slot; the alignment pass freezes document spacers while a slot is active and reconciles on blur; editor save persists fragment + margin and a margin-only edit enables the editor save; idle comments render without a box border while the active one shows it. The real-editor geometry, font line-height parity, vim-mode-preserved-on-create, and the live document freeze/reconcile are hard to assert in jsdom — cover the pure logic in unit tests and call out a **manual smoke test** of both editor modes (rich + vim/raw): font parity, top-flush alignment, no per-keystroke push, vim mode preserved when starting a comment, delete→paste re-attach, and a save→reload→save round-trip for byte-stable markers.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Cross-cutting: ADR 0009 remains the model of record (buffer-clean anchoring + editor-driven flow alignment). This plan refines its surface (layout/styling/save) and fixes two of its mechanisms (the type-to-create remount and the deletion-drops-anchor gap). Phase 6 (freeze-while-editing) deliberately trades live mutual-padding-while-typing for a still document; the push still settles on blur.
