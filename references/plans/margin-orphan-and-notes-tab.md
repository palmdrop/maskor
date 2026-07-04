# Margins UX — transient comment orphaning + general notes as a gutter tab

**Date**: 04-07-2026
**Status**: Todo
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

- [ ] Create branch `agent/margin-orphan-and-notes-tab` from main.

### Phase 1 — Kill the transient orphan demotion

- [ ] Reproduce in a test: feed `buildColumn`/the Margin column a sequence where the block list transiently empties (or drops markers) and returns — assert the comment currently flickers to orphan.
- [ ] Fix: don't demote to orphan while the block list is in an unsettled state. Preferred shape: the column keeps the previous binding when the incoming block list is empty while comments exist (a fragment with comments cannot have zero blocks — markers live in blocks), and/or gates orphan grouping on the editor's load state (the load-guard/`isLoading` signal already exists in `prose-editor.tsx`; check what the Margin column can observe without new coupling). Pick the smallest reliable gate and document why.
- [ ] Make sure *real* orphaning (marker genuinely deleted from the prose) still demotes promptly — the freeze/orphan safety net from `fragment-split.md` must keep working.
- [ ] Tests: transient empty/marker-less block list does not orphan; a genuinely removed marker still does.

### Phase 2 — General notes → third gutter tab

- [ ] Extend the gutter tab state to `"margin" | "aspect" | "notes"` (`fragment-editor.tsx:182`) and render the notes editor as that tab's content; remove `MarginNotesSection` from the column footer.
- [ ] Keep behavior: notes remain part of the Margin save/swap pipeline (coupled save in `fragment-editor.tsx` `onContentSave`, margin swap mirror) — only the surface moves. The active-slot model (`activeSlot.kind === "notes"`) must still work from the new tab, or be simplified if the slot coupling no longer makes sense outside the column (decide and document).
- [ ] Verify the bottom-of-column comment issues are gone with the footer removed: comment creation near the fragment end is not offset and nothing hides it. If an offset remains, inspect the geometry/clamping in `use-margin-geometry.ts` and fix.
- [ ] Check the orphan foot group still renders sensibly now that the footer only holds orphans + controls.
- [ ] Tests: notes tab renders/saves; existing margin-column tests updated for the removed footer section.

### Phase 3 — Close out

- [ ] `bun run format` then `bun run verify`; fix all issues.
- [ ] Update the `Shipped` frontmatter of `specifications/margins.md` (and `notes.md` if it documents the general-notes surface); set plan status; commit.

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
