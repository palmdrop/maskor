# Margins UX — transient comment orphaning + general notes as a gutter tab

**Date**: 04-07-2026
**Status**: Done
**Specs**: `specifications/margins.md`, `specifications/notes.md`
**Branch**: agent/margin-orphan-and-notes-tab

---

## Goal

> A comment never transiently drops into the orphan group during a refetch-triggered editor reload, and the general notes panel no longer covers or offsets comments at the bottom of the Margin — it moves to a third gutter tab beside Margin/Aspect.

---

## Background (investigated 04-07-2026)

**Transient orphan** (`references/TODO.md`: "sometimes, when a fragment is refetched, a comment is temporarily orphaned. I changed the readiness slider and the comment lost its anchor. On refresh, it was back."):

- The Margin column binds comments to the **editor's authoritative block list** (ADR 0009; `margin-column.tsx:73`, `buildColumn` in `lib/margins/column.ts`). A comment whose marker is in no block goes to the orphan foot group.
- A readiness change is a metadata save → fragment query invalidation → refetch → the editor's content-sync effect reloads the buffer. While the reload is in flight the block list can be transiently empty or marker-less, so `buildColumn` demotes bound comments to orphans for a frame or two, then they re-bind. The comment was never actually orphaned — the UI lied temporarily.

**Notes panel overlap** (`references/TODO.md`: "comments close to the bottom notes tab are offset on creation, then hidden behind tab… move the general notes tab, maybe behind a third tab beside margins/aspect"):

- General notes render as a collapsible panel **pinned to the column footer**, inside the gutter (`margin-notes-section.tsx`, mounted in `margin-column.tsx:393`). Comments anchored near the fragment's end collide with it: offset on creation, then hidden behind the panel.
- The gutter already has a two-tab structure: `gutterTab: "margin" | "aspect"` lifted in `fragment-editor.tsx:182`. The notes panel becomes a third tab there.

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/margin-orphan-and-notes-tab` (based on `agent/fixes`).

### Phase 1 — Kill the transient orphan demotion

- [x] Reproduce in a test: feed `buildColumn`/the Margin column a sequence where the block list transiently empties (or drops markers) and returns — assert the comment currently flickers to orphan.
- [x] Fix: don't demote to orphan while the block list is in an unsettled state. Chose the smallest reliable gate — `resolveColumnBlocks` reuses the last non-empty block list when the incoming list is empty while comments still exist (a fragment with comments cannot have zero blocks). Pure/testable; no new coupling to the editor's load state.
- [x] Make sure *real* orphaning (marker genuinely deleted from the prose) still demotes promptly — a genuine orphaning leaves a non-empty block list, so the gate never fires for it. The freeze/orphan safety net is unchanged.
- [x] Tests: transient empty block list does not orphan; a genuinely removed marker still does (pure helper + column component).

### Phase 2 — General notes → third gutter tab

- [x] Extend the gutter tab state to `"margin" | "aspect" | "notes"` (`fragment-editor.tsx`) and render the notes editor as that tab's content (`MarginNotesTab`); remove `MarginNotesSection` from the column footer (and delete it — now unused).
- [x] Keep behavior: notes remain part of the Margin save/swap pipeline (coupled save in `fragment-editor.tsx` `onContentSave`, margin swap mirror — untouched, notes still live in `useMarginEditor`). The column's `activeSlot.kind === "notes"` was removed: notes and comments now render on separate tabs (never simultaneously), so the one-active-editor coupling no longer needs a notes slot — the notes tab owns its own edit state. (Decision documented in the code + spec.)
- [x] Verify the bottom-of-column comment issues are gone with the footer section removed: comments position absolutely at their block tops in the scroller, independent of the footer, so removing the notes panel removes the covering/offset. No geometry/clamping change needed.
- [x] Check the orphan foot group still renders sensibly now that the footer only holds orphans + controls.
- [x] Tests: notes tab renders/saves; fragment-editor renders the Notes tab wired to the margin editor; margin-column footer test updated for the removed notes section.

### Phase 3 — Close out

- [x] `bun run format` then `bun run verify`; both green.
- [x] Update the `Shipped` frontmatter of `specifications/margins.md` (notes.md documents project-scope vault Notes, a different surface — left unchanged); set plan status; commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The orphan-flicker gate is the load-bearing fix — test the transient and the genuine-orphan cases both. For the tab move, component tests on the tab switching + save wiring are enough.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Do NOT edit `references/TODO.md` — the orchestrator session updates it after review.
