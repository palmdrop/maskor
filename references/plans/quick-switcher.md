# Quick-switcher

**Date**: 25-05-2026
**Status**: Done
**Specs**: `specifications/quick-switcher.md`, `specifications/prompting.md`, `specifications/command-palette.md`

---

## Goal

A writer can press `Cmd/Ctrl+O` from any view in an active project, see a fuzzy-searchable list of every selectable entity (fragments, aspects, notes, references, sequences), and pick one — landing in the right view per the open-semantics rules in `specifications/quick-switcher.md`, including the suggestion-mode swap-in-place case with correct stat accounting.

---

## Tasks

### Phase 1 — Branch and data foundations

- [x] Create branch `quick-switcher` from `main` (work landed directly on `main`)
- [x] Inventory generated orval hooks for entity lists: fragments, aspects, notes, references, sequences. Each list returns at minimum `{ uuid, key }`; fragments expose `isDiscarded` via `useListFragmentSummaries`
- [x] No missing endpoints — all five hooks already covered the required shape

### Phase 2 — `QuickSwitcher` component

- [x] `src/components/quick-switcher/QuickSwitcher.tsx`: project-scoped modal built as a direct cmdk + Radix Dialog consumer
- [x] Internal model: `{ uuid, key, kind }`; discarded fragments filtered at the boundary
- [x] Empty query: grouped sections in the order Fragments, Aspects, Notes, References, Sequences; alphabetical within each section; empty groups omitted
- [x] Typed query: flat ranked list via cmdk subsequence scoring; type chips on every row
- [x] Row format: type chip + key
- [x] `"No matches"` empty state; `"This project is empty…"` empty state
- [x] Loading state: skeleton rows
- [x] Failure path: close + toast

### Phase 3 — Global binding and shell mounting

- [x] `Cmd/Ctrl+O` capture-phase window listener; mounted in `ProjectShellLayout`
- [x] Editor extensions already yield `Cmd/Ctrl+O` (capture-phase listener preempts them — verified via regression test)
- [x] `Esc` closes via Radix Dialog; focus restoration is inherited

### Phase 4 — Open semantics

- [x] `resolveOpenTarget(currentRoute, picked, projectId)` extracted as a pure function in `resolve-open-target.ts`; covers every row of the open-semantics table; tested per-row
- [x] Fragment / aspect / note / reference / sequence picks all flow through `router.navigate(resolveOpenTarget(...))`
- [x] Sequence pick uses a search-merge function so density is preserved on same-route swaps

### Phase 5 — Suggestion-mode integration

- [x] In suggestion mode, a fragment pick navigates to `/suggestion?fragment=:uuid` (swap-in-place via search param)
- [x] Suggestion-mode loader is search-param-driven; no engine re-invocation on quick-switcher action
- [x] Eligibility bypass: the suggestion page renders the fragment directly from the param, no eligibility check on this path
- [x] `voluntary_open_count++` on quick-switcher fragment picks via the new `recordPick` storage entrypoint (suggestion-mode branch); outside suggestion mode, FragmentPage's mount effect continues to handle the bump
- [x] `avoidance_count` is NOT incremented after a quick-switcher pick: `recordPick` flags the cooldown entry user-picked, and `getNext` skips the avoidance increment for user-picked entries
- [x] Cooldown: `recordPick` adds the fragment to cooldown so the engine does not immediately re-surface it on the next press of Next

### Phase 6 — Palette composition refactor

- [x] `Switch sequence…` removed from the global catalog (and its tests)
- [x] Project-shell-scoped `Switch to…` command added (category `navigation`); opens the quick-switcher
- [x] `Switch project…` unchanged
- [x] `specifications/command-palette.md` `Shipped:` updated

### Phase 7 — Tests, verification, and spec frontmatter

- [x] `QuickSwitcher` rendering tests: grouping order + empty-group omission; flat ranked typed list; `"No matches"`; empty-project state; key collision shows two rows with chips
- [x] Discarded fragments are absent; fragments are selectable (rendering test)
- [x] `resolveOpenTarget` unit tests cover every (route × kind) row of the open-semantics table
- [x] Suggestion-mode integration tests: suggestion-mode fragment pick calls `recordPick` and swaps in place; outside suggestion mode, no `recordPick` call
- [x] Storage tests for cooldown `markUserPicked` / `wasUserPicked`
- [x] API tests for `POST /suggestion/pick/:fragmentId`: 204 + voluntary_open_count bump; cooldown excludes the picked fragment from the next selection; avoidance is NOT incremented when Next is pressed after a pick
- [x] Editor-extension Cmd/Ctrl+O regression: capture-phase listener fires from inside a contentEditable
- [x] `bun run verify`
- [x] Update `specifications/quick-switcher.md` `Shipped:`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
