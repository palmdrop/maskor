# Overview scroll-to-fragment, list sequence-sort, and right-panel excerpt

**Date**: 11-06-2026
**Status**: Todo
**Specs**: `specifications/vision.md`

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

- [ ] `FragmentDetailPanel.tsx`: always render the key + server `excerpt` view; remove the inline-editing `FragmentProse` branch. Keep "Open fragment" and "Remove from sequence" buttons.
- [ ] `RightSidebar.tsx` + `OverviewPage/index.tsx`: stop threading `onSaveContent` / `selectedContent` into the right panel. Leave the spine's own editing path (`handleSaveFragmentContent`) untouched.
- [ ] Update `FragmentDetailPanel.test.tsx`: no editor rendered, excerpt shown, both buttons present.
- [ ] `git commit` Phase 1.

### Phase 2 — FragmentListPage sort dropdown

- [ ] Add `useListSequences` to `FragmentListPage.tsx`; build a per-sequence flattened order map (section position → fragment order).
- [ ] Add a sort dropdown to the sidebar: **Name** (`key`), **Updated at** (`updatedAt`), then a divider listing every sequence by name. (Created at is deferred — see Notes.)
- [ ] Apply the chosen sort to the filtered list. Sequence sort: placed fragments in sequence order, unplaced fragments at the bottom (alphabetical among themselves).
- [ ] Persist the selected sort per project (small persisted-string hook, or extend `lib/nav-state.ts`).
- [ ] Tests: each sort order; unplaced-at-bottom for a sequence sort.
- [ ] `git commit` Phase 2.

### Phase 3 — Sidebar click scrolls spine + updates anchor (trickiest)

- [ ] Wire `hooks/useFragmentAnchor.ts` into `OverviewPage/index.tsx`. Spine anchors (`id="fragment-<uuid>"` from `FragmentProse`) already exist.
- [ ] Thread a new `onScrollToFragment` callback: `ReorderList` → `SectionGroup` → `ReorderRow`. On a plain row click, select (current behavior) **and** call `navigateToAnchor(uuid)` (sets hash + `scrollIntoView`). Modifier clicks (cmd/shift) only select — no scroll, no anchor change.
- [ ] Load reconciliation: record the last app-authored hash in `sessionStorage` (via `lib/nav-state.ts`). On mount:
  - If the URL hash is present and does **not** match the session-authored value (external/deep link, or fresh tab) → scroll to the anchor and skip the persisted-scroll restore. **Anchor wins.**
  - Otherwise (leftover hash from our own click, or no hash) → restore the persisted scroll, and suppress `useFragmentAnchor`'s load-time scroll effect. **Scroll wins.**
- [ ] Tests: the two reconciliation branches; a sidebar row click sets the hash and scrolls.
- [ ] `git commit` Phase 3.

### Phase 4 — Finalize

- [ ] `bun run format`, then `bun run verify`. Fix any lint/test failures.
- [ ] Update `specifications/vision.md` `Shipped` frontmatter with the three features (no implementation detail). If `vision.md` proves to be the wrong spec, pause and ask before editing.

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
