# Overview scroll-to-fragment, list sequence-sort, and right-panel excerpt

**Date**: 11-06-2026
**Status**: Done
**Specs**: `specifications/overview.md`
**Closed**: 11-06-2026

---

## Goal

> Three independent Overview/fragment-list refinements:
> 1. Clicking a fragment in the Overview ordering sidebar scrolls the spine to that fragment and updates the `#fragment-<uuid>` URL anchor; on load, a remembered scroll position wins over a leftover anchor, but an externally-supplied anchor (deep link) wins over the remembered scroll.
> 2. The FragmentListPage gains a sort dropdown — Name, Updated at, and a section listing every sequence — sorting by the chosen sequence's order with unplaced fragments at the bottom.
> 3. The Overview right panel stops editing fragments inline and shows the key + server excerpt only, keeping the "Open fragment" and "Remove from sequence" buttons.

"Done" = all three behaviors work, are covered by tests, and `bun run verify` passes.

---

## Branch

Do **not** create a new branch. Stay on the current branch (`agent/fragments-and-sequences`) and do all work there. This overrides the template's default "create a new branch" step.

---

## Tasks

### Phase 1 — Right panel excerpt-only (smallest, least risk)

- [x] `FragmentDetailPanel.tsx`: always render the key + server `excerpt` view; remove the inline-editing `FragmentProse` branch. Keep "Open fragment" and "Remove from sequence" buttons. _(2026-06-11)_
- [x] `RightSidebar.tsx` + `OverviewPage/index.tsx`: stop threading `onSaveContent` / `selectedContent` into the right panel. Leave the spine's own editing path (`handleSaveFragmentContent`) untouched. _(2026-06-11)_
- [x] Update `FragmentDetailPanel.test.tsx`: no editor rendered, excerpt shown, both buttons present. _(2026-06-11)_
- [x] `git commit` Phase 1. _(2026-06-11)_

### Phase 2 — FragmentListPage sort dropdown

- [x] Add `useListSequences` to `FragmentListPage.tsx`; build a per-sequence flattened order map (section position → fragment order). _(2026-06-11 — `lib/fragments/sort.ts`)_
- [x] Add a sort dropdown to the sidebar: **Name** (`key`), **Updated at** (`updatedAt`), then a divider listing every sequence by name. (Created at is deferred — see Notes.) _(2026-06-11)_
- [x] Apply the chosen sort to the filtered list. Sequence sort: placed fragments in sequence order, unplaced fragments at the bottom (alphabetical among themselves). _(2026-06-11)_
- [x] Persist the selected sort per project (new `usePersistedString` hook). _(2026-06-11)_
- [x] Tests: each sort order; unplaced-at-bottom for a sequence sort. _(2026-06-11 — `lib/fragments/sort.test.ts`)_
- [x] `git commit` Phase 2. _(2026-06-11)_

### Phase 3 — Sidebar click scrolls spine + updates anchor (trickiest)

- [x] Wire `hooks/useFragmentAnchor.ts` into `OverviewPage/index.tsx` (`ready: false` disables its load-time scroll; the page drives load scrolling). _(2026-06-11)_
- [x] Plain row click selects **and** scrolls + sets the anchor. Implemented by wrapping the select handler at the index level (`handleSidebarSelectFragment`) rather than threading a new prop through `ReorderList`/`SectionGroup`/`ReorderRow` — the row already forwards modifiers, so no child changes were needed. Modifier clicks only select. _(2026-06-11)_
- [x] Load reconciliation: authored anchor recorded in `sessionStorage` (`lib/nav-state.ts`); pure decision in `OverviewPage/utils/loadScroll.ts`. External deep link → anchor wins; leftover/own anchor → remembered scroll wins. _(2026-06-11)_
- [x] Tests: reconciliation branches (`loadScroll.test.ts`); sidebar row click sets the hash + authors the anchor; meta-click does not. _(2026-06-11)_
- [x] `git commit` Phase 3. _(2026-06-11)_

### Phase 4 — Finalize

- [x] `bun run format`, then `bun run verify` — passing (exit 0; backend 0 fail; 762 frontend tests pass). _(2026-06-11)_
- [x] Updated `specifications/overview.md` `Shipped` for features 1 + 3, and `specifications/fragment-model.md` for feature 2 (sort dropdown — spec home chosen by the developer). _(2026-06-11)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Phase 1: extend `FragmentDetailPanel.test.tsx`.
- Phase 2: new/updated FragmentListPage test for sort ordering and unplaced placement.
- Phase 3: reconciliation-branch tests (anchor-wins vs scroll-wins) and a row-click → hash + scroll test. The actual `scrollIntoView` geometry is not verifiable in jsdom — assert the calls/hash, not pixels.

---

## Notes

**Created at sort is deferred.** Fragments carry no `createdAt` in the domain model or index layer — only `updatedAt`. Adding it is backend work (domain schema + index + API + codegen, plus deciding the source: file birthtime vs frontmatter). Logged in `references/suggestions.md` (2026-06-11). The dropdown omits "Created at" for now.

**Reconciliation tension (Phase 3).** The original ask was "scroll trumps anchor"; the refined decision is "anchor wins if explicitly in the URL." The sessionStorage-authored-hash mechanism distinguishes a deep link from a leftover click-hash. Known edge case: reloading (F5) a pasted deep-link URL falls through to scroll-restore once the session has recorded a hash — acceptable.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, stay on the current branch (`agent/fragments-and-sequences`) — do **not** create a new branch — and proceed with development there.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit`, and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In progress`. ALSO update the relevant frontmatter of the relevant specs: add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
