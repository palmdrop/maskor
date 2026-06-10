# Overview Surface Hooks

**Date**: 10-06-2026
**Status**: Done
**Specs**: `specifications/overview.md`

---

## Goal

> The selection state machine and the section-operations cluster are extracted from `OverviewPage/index.tsx` into two tested hooks — `useFragmentSelection` and `useSectionOps` — so each is testable through its own interface rather than by mounting the whole page; `OverviewPage` shrinks to composition and the `overviewScope` context is assembled from the hooks. "Done" = both clusters live behind their own hook with unit tests, the page drops from 824 toward ~300 lines, and Overview behavior is unchanged.

---

## Context

From the architecture review (candidate 3a). `OverviewPage/index.tsx` (824 lines) carries two inline state machines that are locality failures — they can only be exercised by mounting the entire page (the 883-line `OverviewPage.test.tsx` is the symptom):

- **Selection** — `selection` / `selectionAnchor` state, `selectionSet` / `primarySelectedUuid` / `placedSelection` derivations, `handleSelectFragment` (toggle + shift-range over `visibleOrder`), `clearSelection`, and the persist/restore effects against `lib/nav-state`.
- **Section operations** — `splitContext` and the `canSplitBefore/After` guards, `groupSelection`, `splitBefore/After`, `moveSelectionToSection` (+ `sectionsForMove`), `mergeSectionUp/Down` (+ `mergeableUp/DownSections`), and `unplaceFragment` (+ `placedFragmentsForUnplace`). This is roughly `index.tsx:424-616`.

The `overviewScope` command context (30 fields) is fine as a publish surface; the bloat is in the *provider* assembling it inline. The three sibling hooks `useArcData`, `useSequenceDnD`, `useSectionManager` already establish the extraction pattern here — this plan follows it for the two remaining clusters.

### Resolved design decisions

- **Scope = selection + section-ops.** Keyboard-move (`handleFragmentKeyboardMove` / `handleSectionKeyboardMove` / `handleMainKeyDown`) and the arc/detail UI-state toggles stay inline this pass — they are smaller and less entangled.
- **Selection (3a) only.** The sequence-mutation consolidation (3b) lives in `references/plans/optimistic-mutation-primitive.md`. This plan calls the existing `useSequenceMutations` interface unchanged and does not depend on that plan landing first.
- **No behavior change.** Pure structural extraction; the existing Overview tests are the regression guard.

**Implementation order (3-plan set)**: implement **last**. It touches only `OverviewPage` and new hook files — disjoint from the other two plans — and calls the existing `useSequenceMutations` interface unchanged, so it is unaffected by whether `optimistic-mutation-primitive.md` has landed.

### Constraints the implementation must respect

- `useFragmentSelection` needs `visibleOrder` (placed-then-pool ordering) for shift-range, and `fragmentByUuid` to filter restored selection to still-existing fragments. These are derived in the page from query data — pass them in; do not refetch inside the hook.
- The restore-on-mount / persist-after-restore ordering guard (`hasRestoredSelectionRef`, so the initial empty selection does not overwrite stored state) must move into the hook intact.
- `useSectionOps` orchestrates over `useSequenceMutations` and the derived `sectionsData` / `placedSelection`; it should take those as inputs, not reach back into the page's query state.
- The command dispatch contract is unchanged: section-op commands still `commands.run("overview:…")`, and the page still publishes `overviewScope` — now wiring the hooks' outputs into that context.
- `splitContext`'s "split before X = split op on X; split after X = split op on the next fragment" semantics must be preserved exactly.

---

## Tasks

### Phase 0 — Branch

- [x] ~~Create branch~~ — N/A: implemented on the shared worktree branch `agent/frontend-refactor` (per-phase commits)

### Phase 1 — `useFragmentSelection`

**Goal**: The selection state machine behind one interface, with the persistence guards intact.

- [x] Create `src/pages/OverviewPage/hooks/useFragmentSelection.ts`
- [x] Own `selection` / `selectionAnchor`; derive `selectionSet`, `primarySelectedUuid`
- [x] Implement `handleSelectFragment(uuid, { toggle, range })` over the passed-in `visibleOrder`
- [x] Implement `clearSelection`
- [x] Move the persist effect and the restore-on-mount effect (filtered via `fragmentByUuid`), preserving the `hasRestored*` ordering guard
- [x] Unit tests: single-select, toggle, shift-range both directions, restore-filters-to-existing, persist-after-restore-only
- [x] `git commit`

### Phase 2 — `useSectionOps`

**Goal**: The section-operations cluster behind one interface.

- [x] Create `src/pages/OverviewPage/hooks/useSectionOps.ts`
- [x] Take `projectId`, `sequence`, `sectionsData`, `placedSelection`, and the `useSequenceMutations` handle as inputs
- [x] Expose `splitContext` + `canSplitBefore` / `canSplitAfter`, `groupSelection`, `splitBefore` / `splitAfter`, `moveSelectionToSection` + `sectionsForMove`, `mergeSectionUp` / `mergeSectionDown` + `mergeableUpSections` / `mergeableDownSections`, `unplaceFragment` + `placedFragmentsForUnplace`
- [x] Preserve the exact split-before/after fragment-targeting semantics
- [x] Unit tests: split guards at section boundaries, mergeable-list derivation, move-target position
- [x] `git commit`

### Phase 3 — Recompose `OverviewPage`

**Goal**: The page consumes both hooks and assembles the command context from them.

- [x] Replace the inline selection block with `useFragmentSelection`
- [x] Replace the inline section-ops block (~`index.tsx:424-616`) with `useSectionOps`
- [x] Assemble `useCommandScope(overviewScope, …)` from the hooks' outputs
- [x] Confirm `OverviewPage.test.tsx` passes unchanged; migrate any coverage that now belongs to the hook tests
- [x] `git commit`

### Phase 4 — Verify and close

- [x] `bun run format`
- [x] `bun run verify` — fix any lint / type / test failures
- [x] Remove any `references/suggestions.md` entries made obsolete by this work
- [x] Set this plan's status to `Done` (or `In progress` if partial)
- [x] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The point of this plan is testability: `useFragmentSelection` and `useSectionOps` become unit-testable without mounting the page. Cover the selection edge cases (shift-range, restore filtering, persist ordering) and the section-op guards (split boundaries, mergeable derivation) at the hook level. The existing `OverviewPage.test.tsx` stays as the integration regression guard and should shrink as coverage moves down to the hooks.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

This is a pure refactor with no behavior change, so `specifications/overview.md` needs no `shipped` update. If behavior shifts during implementation, treat that as a scope signal and update the spec frontmatter accordingly.
