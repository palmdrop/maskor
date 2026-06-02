# Margins II: annotated-paragraphs column, anchor refinements & frontmatter preservation

**Date**: 02-06-2026
**Status**: Todo
**Specs**: `specifications/margins.md`, `specifications/fragment-editor.md`, `references/adr/0008-margin-is-an-annotated-paragraphs-column.md`, `references/adr/0007-margin-anchored-comments-supersede-file-based-comments.md`

---

## Goal

> The Margin reads and edits as a **per-paragraph annotated-paragraphs column** scribbled beside the fragment: it scroll-syncs with the editor, reveals a slot beside any paragraph on hover, creates an anchor+comment on first keystroke, keeps one comment per block, derives binding live from the in-body marker (so a moved paragraph carries its comment), follows the editor's mode, and aligns comments to their blocks by **margin-side padding** (document-side padding deferred). Anchored comments show a guide line, not an excerpt; orphans show their last-known excerpt. The vim/raw marker is a dot, raw only behind a "show source" toggle. Separately, unmanaged user frontmatter survives a Maskor write for aspects, notes, and references — not just fragments.

---

## Context

Iteration 1 (`references/plans/margins.md`, Status Done) shipped the Margin end-to-end: storage entity + DB index + API (Phases 1–2), export marker-strip (2b), in-editor markers (3), the comment gesture (4), the linked swap pair (5), the side-by-side panel (6), orphan handling (7), and the fragment `notes:` removal with `extraFrontmatter` preservation (8). This iteration reworks the **interaction/layout model** per the 2026-06-02 grilling session — recorded in **ADR 0008** — and pays down the follow-ups in `references/TODO.md` (Margins) and `references/suggestions.md`.

Current code touch-points (for orientation, not prescription):

- Vim/raw marker rendering: `packages/frontend/src/components/comment-marker-cm.ts` (currently reveal-on-cursor-line — being replaced by a dot + "show source" toggle).
- Panel + state: `packages/frontend/src/components/margins/` (`margin-panel.tsx`, `comment-card.tsx`, `margin-notes-editor.tsx`), `packages/frontend/src/hooks/useMarginEditor.ts`.
- Gesture & wiring: `packages/frontend/src/lib/commands/scopes/margin.ts`, `packages/frontend/src/components/fragments/fragment-editor.tsx`, the `ProseEditor` marker methods in `prose-editor.tsx`.
- Backend excerpt/orphan recompute on fragment save: `recomputeMarginOrphans` in `packages/storage/src/service/storage-service.ts`; comment CRUD in the same file + `packages/api/src/commands/margins/`.
- Frontmatter preservation pattern to mirror: `packages/storage/src/vault/markdown/mappers/fragment.ts` (`extraFrontmatter`).

---

## Tasks

Phases are ordered so each is independently committable and leaves the app working. Phases 1–3 are smaller, lower-risk anchor/behaviour refinements; Phase 4 is the large UI rebuild that depends on them; Phase 5 is the deliberately-deferred hard half; Phases 6–7 are an independent rider and reconciliation.

### Phase 0 — Branch & groundwork

- [ ] Verify that you are in a branch called "agent/margins-2". If not, stop immediately and report.
- [ ] Confirm ADR 0008 and the updated `specifications/_glossary.md` **Anchor** term are committed and reflect the agreed model (they were written during the grilling session). No behaviour change in this phase.
- [ ] Commit (docs only) if anything is outstanding.

### Phase 1 — Vim/raw marker rendering: dot + "show source" toggle

- [ ] Replace the reveal-on-cursor-line behaviour in `comment-marker-cm.ts`: always hide the whole `<!--c:ID-->` (zero-width), and render a subtle **dot cue** on lines carrying a comment. The raw marker is never revealed inline by default.
- [ ] Add a **"show source"** toggle (editor/margin scope) that, when on, reveals the raw markers verbatim. Default off. Persisted per project.
- [ ] `specifications/margins.md`: update the "CM6/vim marker rendering" prior decision (reveal-on-block-cursor → dot + show-source toggle), pointing to ADR 0008; `specifications/fragment-editor.md` Shipped entry.
- [ ] Tests: decoration hides the marker with no gap; annotated line gets the dot cue; toggle reveals/hides raw. Commit.

### Phase 2 — Excerpt: live block-opening, refresh-on-save, freeze-on-orphan

- [ ] Excerpt is the **block opening** (cap ~80 chars, ellipsis). The panel derives the **display** excerpt live from the current block in the fragment buffer (no file churn).
- [ ] On fragment save, **refresh** each anchored comment's stored excerpt from its block's current opening (extend the existing orphan-recompute hook), and **freeze** it once the comment is orphaned. Keep the Obsidian-visible `> excerpt` honest.
- [ ] (Display rule that the excerpt is hidden for anchored comments / shown only for orphans lands with the column rebuild — Phase 4. This phase only changes excerpt *source/derivation/storage*.)
- [ ] Glossary **Anchor** term already updated; add `specifications/margins.md` Shipped + prior-decision note for the live-derive/freeze model.
- [ ] Tests: excerpt derives from block opening and updates as the block changes; stored excerpt refreshes on save; freezes on orphan; round-trip preserves frozen excerpts. Commit.

### Phase 3 — One comment per block; gesture focuses existing; delete strips the marker

- [ ] Enforce **one comment per block**. The "Comment this block" gesture, run on a block that already carries a marker, **focuses the existing comment** instead of injecting a second marker.
- [ ] **Delete = coordinated buffer edit**: removing a comment strips that block's marker from the fragment buffer **and** removes the comment from the Margin buffer; each persists on its own next save. Deleting an **orphaned** comment is a no-op on the fragment side.
- [ ] `specifications/margins.md`: delete the "Multiple comments may bind to the same block" line; record the 1:1 decision and the delete-strips-marker behaviour (→ ADR 0008). Shipped entry.
- [ ] Tests: re-gesturing an anchored block focuses (no second marker); delete strips the marker (fragment dirtied) and removes the comment; orphan delete leaves the fragment untouched. Commit.

### Phase 4 — Annotated-paragraphs column (the rebuild)

The large phase. Rebuilds the Margin panel from a sparse comment list into a per-paragraph, scroll-synced, flow-aligned column (ADR 0008). Margin-side padding only — see Phase 5 for the document side.

- [ ] **Slot per paragraph.** The panel enumerates every fragment block (live, from the buffer), aligning a slot to each. Empty slots reveal **on hover** only; the column stays uncluttered.
- [ ] **Type-to-create.** Typing into the slot beside an un-annotated paragraph creates the marker + comment on first non-empty content (coordinated buffer edit, persists on save); an untouched slot creates nothing.
- [ ] **Live-derived binding (invariant).** Comment↔paragraph alignment is computed from each marker's current position in the buffer — never a cached ordinal — so moving a whole paragraph carries its marker and the comment follows.
- [ ] **Scroll sync.** The margin column and the fragment editor scroll in lockstep.
- [ ] **Margin-side padding alignment.** Pad comments shorter than their block so rows line up; comments longer than their block stay **clipped** (document-side push deferred to Phase 5).
- [ ] **Collapse model.** Global default collapsed (comment clipped to its paragraph's height with ellipsis/fadeout); the **focused** slot auto-expands; a **global expand-all** toggle. Persisted defaults.
- [ ] **Notes section** = a collapsible **pinned header** at the top of the margin column, scrolling with the content.
- [ ] **Mode coupling.** Margin editing surfaces follow the fragment editor mode; **one active editor** (the focused slot / notes field instantiates the full vim-CM6 or TipTap editor) while all other slots render statically in the matching style.
- [ ] **Guide line + excerpt display rule.** Anchored comments show a guide line/bracket to their paragraph and **no excerpt**; **orphaned** comments show their last-known excerpt in the orphan group.
- [ ] **Focus keymap.** "Comment this block" demotes to a **jump** to the current paragraph's slot; **Tab/Shift-Tab** and **↓/↑** (at comment boundaries) move between slots; **Escape** returns the caret to the bound paragraph; **Enter** is a newline within the comment.
- [ ] `specifications/margins.md` (Side-by-side surface) + `specifications/fragment-editor.md`: rewrite to the annotated-paragraphs column; Shipped entries (→ ADR 0008).
- [ ] Tests: slot reveal on hover; type-to-create (and no-create on empty); live re-alignment after a paragraph move; scroll sync; collapse focus-expand + expand-all; mode coupling renders static vs active; focus keymap (jump / Tab / Escape / Enter); orphan group shows excerpt while anchored slots do not. Commit.

### Phase 5 — Document-side padding (DEFERRED — later)

> Explicitly deferred. Ships after Phase 4 is proven. Marked here so the agent does **not** attempt it in the first pass.

- [ ] Inject vertical space **below a paragraph** in the fragment editor (TipTap node decorations / CM6 line widgets) so a long expanded comment pushes the next paragraph down and keeps the next row aligned — in both modes, re-measured on edit/resize.
- [ ] Guard: padding must not alter the buffer text/markdown or break the in-block marker.
- [ ] Tests: a comment taller than its block pushes the following paragraph down so rows stay aligned; no text/markdown mutation; works in rich and vim/raw. `specifications/margins.md` Shipped. Commit.

### Phase 6 — Frontmatter preservation for aspects, notes & references (self-contained)

Independent of the margin work; closes the data-loss surprise in `references/suggestions.md`.

- [ ] Apply the fragment `extraFrontmatter` round-trip (iteration 1, Phase 8 — `mappers/fragment.ts`) to the **aspect** mapper (`mappers/aspect.ts`) and the **note/reference** writers (`vault.ts`): capture unmanaged frontmatter keys on read, re-emit them on write. Aspects keep their managed `notes:` list — only *unmanaged* keys are preserved.
- [ ] Confirm the entity domain schemas carry an optional `extraFrontmatter` and that API response schemas omit it (mirror the fragment treatment); regenerate the client if any route schema changes.
- [ ] `specifications/attachments.md` (+ `notes.md`/`references.md`/aspect config spec as relevant): note that unmanaged frontmatter is preserved; Shipped entries. Remove/replace the suggestions.md entry once fixed.
- [ ] Tests: vault round-trip preserves user keys (`tags`, `aliases`) for aspect/note/reference; managed keys still rebuilt; aspect `notes:` list unaffected. Commit.

### Phase 7 — Final reconciliation

- [ ] `bun run format` then `bun run verify`; fix lint/test/codegen-sync failures.
- [ ] Sweep touched specs for Shipped accuracy and Status; ensure ADR 0008 cross-references are present.
- [ ] Add any new surprises to `references/suggestions.md`; tick the resolved `references/TODO.md` Margins items.
- [ ] Set this plan's Status to `Done` (or `In progress` if partial); set `Closed` date.
- [ ] Final commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Priority test targets: live re-alignment when a paragraph is moved (comment follows its marker), type-to-create vs no-create-on-empty, delete strips the marker, excerpt live-derive + refresh-on-save + freeze-on-orphan, the focus keymap (jump / Tab / Escape / Enter), mode-coupling (one active editor), and the aspect/note/reference frontmatter round-trip. The real-editor marker/padding geometry is hard to assert in jsdom/happy-dom — cover the pure logic in unit tests and call out a manual smoke test of both editor modes.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Cross-cutting: ADR 0008 is the source of truth for the interaction/layout model; ADR 0007 for the data model. Phase 5 (document-side padding) is deliberately deferred — do not pull it forward. Phase 6 (frontmatter) is an independent rider and may be sequenced anywhere relative to the margin phases.
