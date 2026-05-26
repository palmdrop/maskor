# Review: Quick-switcher

**Date**: 2026-05-26
**Scope**: `packages/frontend/src/components/quick-switcher/`, `packages/frontend/src/lib/commands/`, `packages/frontend/src/pages/ProjectShellLayout.tsx`, `specifications/quick-switcher.md`, `.claude/CLAUDE.md`
**Plan**: `references/plans/quick-switcher.md`
**Spec**: `specifications/quick-switcher.md`

Commits reviewed: `cd44910` (feat) and `66ef7e1` (docs).

---

## Overall

The visible surface ships and behaves as the spec describes for the common path: `Cmd/Ctrl+O` opens a project-scoped modal, the empty query shows grouped sections in the prescribed order, typed queries collapse to cmdk-ranked results, type chips disambiguate, and the suggestion-mode swap-in-place + `voluntary_open_count++` path works. However, the spec was flipped to `Status: Shipped` while two of the plan's seven phases are materially incomplete: the cooldown-on-Next behavior for quick-switcher picks is not wired up (real correctness bug), `resolveOpenTarget` was never extracted as a pure function, the entire Phase 7 test suite is missing, and `specifications/command-palette.md` was not updated to record the palette refactor. The CLAUDE.md tweak has a typo.

---

## Bugs

### 1. Cooldown is never applied to quick-switcher picks

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:218-263`, `packages/storage/src/service/storage-service.ts:1421-1490`

Plan Phase 5 requires: *"pressing `Next` after a quick-switcher pick must enter the picked fragment into cooldown — same behavior as engine-surfaced picks."* Spec acceptance criterion: *"Pressing `Next` after a quick-switcher pick in suggestion mode applies the same cooldown to the picked fragment as any engine-surfaced fragment would receive."*

`cooldown.add(uuid)` is only called inside `storageService.suggestion.getNext()` for the *selected* (newly chosen) fragment. A quick-switcher pick navigates directly via the URL search param and never touches cooldown. Concrete sequence:

```
user picks fragment A via quick-switcher  → URL search.fragment = A
press Next → loadNext(excludeUuid=A) → getNext(exclude=A)
  → cooldown.has(A) === false  (never added)
  → A is in the eligible pool again on the *next* Next
```

So fragment A can be immediately re-surfaced by the prompting engine, violating the spec's *"cooldown is mode-agnostic"* invariant.

Note that the *no-avoidance* behavior currently passes only because `cooldown.has(A)` is false (`storage-service.ts:1431-1437` gates avoidance on cooldown membership). Once cooldown is added (as required), avoidance would start firing for picked fragments too. The fix needs both: (a) add the picked fragment to cooldown on pick, and (b) introduce a "user-picked" flag parallel to `wasEditedWhileSurfaced` so the avoidance check can branch on it.

Fix: add a `recordPick`-style API that calls `cooldown.add(uuid)` and marks the entry as user-picked; have `QuickSwitcher.handleSelect` invoke it on every fragment pick (not just inside suggestion mode); update `getNext`'s avoidance check to skip user-picked entries.

---

## Design

### 2. `resolveOpenTarget` was not extracted as a pure function

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:46-55, 218-263`

Plan Phase 4 explicitly required `resolveOpenTarget(currentRoute, pickedEntity)` returning a typed `{ kind: 'navigate', path } | { kind: 'swap-in-place' }` so every row of the open-semantics table is unit-testable. Instead the routing decision is inlined in `handleSelect` and the current-route classification is regex-matched against pathnames in `getCurrentRouteKind()`. The regex `/\/aspects\/[^/]+$/` is brittle (any future route ending `/<word>/<id>` could collide), and the inlined branches block the table-driven tests Phase 7 called for.

Fix: extract a pure module taking the matched route id (from `router.state.matches`, not a regex) and the entity kind, returning a discriminated union; cover every row of the table from `specifications/quick-switcher.md:88-94` with a unit test.

### 3. Zero tests landed for a Phase-7-required feature

`packages/frontend/src/components/quick-switcher/` has no test file.

Plan Phase 7 enumerated nine specific test cases. None exist:
- No `QuickSwitcher.test.tsx` (rendering, grouping, key-collision disambiguation, discarded filter, ready-status inclusion)
- No `resolveOpenTarget` unit tests (the function itself isn't extracted)
- No suggestion-mode integration tests (swap-in-place, `voluntary_open_count++`, no-avoidance, cooldown, eligibility bypass)
- No editor-extension regression test for `Cmd/Ctrl+O` (the existing `Cmd/Ctrl+K` analog at `packages/frontend/src/components/command-palette/__tests__/CommandPalette.test.tsx:229` is the pattern)

Project CLAUDE.md: *"Write tests when adding features or changing behavior."*

### 4. `specifications/command-palette.md` not updated

`specifications/command-palette.md:10` still reads *"parameterized `Switch project…` and `Switch sequence…`"* despite `Switch sequence…` being removed in this commit and replaced by `Switch to…`. Plan Phase 6 required this update inline with the implementation.

### 5. Spec marked `Shipped` while Phase 5 + 7 are incomplete

`specifications/quick-switcher.md:3-5` was set to `Status: Shipped` / `Shipped: 2026-05-26`. With cooldown wiring missing (Bug 1) and zero tests landed (Design 3), this is inaccurate. Either back the status out to `In progress` until the remaining work lands, or split the spec's `Shipped:` entry to enumerate exactly what shipped (binding, catalog, open semantics for non-suggestion routes, palette refactor) and leave cooldown + tests out.

The plan markdown still has all checkboxes unchecked, contradicting the spec frontmatter. Pick one source of truth.

---

## Minor

### 6. Sequence pick clobbers the user's `density` preference

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:254-260`

`handleSelect` passes `search: { sequence: entry.uuid, density: "full" }`. If the user was on `density: "compact"`, the pick silently resets their tile density. The removed `switchSequence` global command had the same behavior (also hardcoded `"full"`), so this is not a regression — but the spec only says *"swap active sequence in place"*, not *"reset density"*. Prefer the partial-merge pattern used at `packages/frontend/src/pages/OverviewPage/index.tsx:133`:

```ts
search: (previous) => ({ ...previous, sequence: entry.uuid })
```

### 7. CLAUDE.md typo

`.claude/CLAUDE.md:11` (commit `66ef7e1`) reads *"you usually do not have start it yourself"* — missing "to". Should be *"you usually do not have **to** start it yourself"*.

### 8. Five list hooks fire eagerly on every project mount

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:112-116`

Because the switcher is mounted unconditionally inside `ProjectShellLayout`, `useListFragmentSummaries`, `useListAspects`, `useListNotes`, `useListReferences`, and `useListSequences` all kick off on every project navigation, even when the user never opens the switcher. For a single-user local app this is fine, and the warm cache benefits the open-time UX. Worth knowing if list endpoints get expensive.

### 9. Duplicate label maps

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:26-40`

`KIND_LABELS` (plural, for group headings) and `KIND_CHIP_LABELS` (singular, for chips) are two near-parallel records of the same enum. Collapse into one record with a helper, or derive plural from singular.

### 10. `recordFragmentVisit` is fire-and-forget without logging

`packages/frontend/src/components/quick-switcher/QuickSwitcher.tsx:230-232`

`void recordFragmentVisit(...).catch(() => { /* Non-critical — ignore failures. */ })`. Stat-tracking failures will be silently invisible in dev. Matches the existing pattern at `packages/frontend/src/pages/FragmentPage.tsx:19-21`, so consistent — but the project's CLAUDE.md says *"If you ever encounter anything surprising in the code base, notify the developer"* and a silently-failing stat increment qualifies. Consider at least a `console.warn`.

### 11. `recordFragmentVisit` uses hand-rolled `customFetch`, not the generated client

`packages/frontend/src/api/suggestion.ts:21-25`

Pre-existing (also used in `FragmentPage.tsx`), so not introduced here — but the frontend CLAUDE.md says *"Use the generated orval client for every API call. Do not hand-roll … against `customFetch`"*. The generated `useRecordFragmentVisit` already exists at `packages/frontend/src/api/generated/suggestion/suggestion.ts:337`. Worth opening as a separate cleanup item.

---

## Non-issues

- **Capture-phase keydown listener inside `QuickSwitcher`** — duplicates the `CommandPalette` pattern (`CommandPalette.tsx:143-155`) and correctly removes with matching `{ capture: true }` flag. Stacking one window listener per global modal is fine at this scale.
- **`router.navigate` for same-route picks (Fragment editor → another fragment, Overview → another sequence)** — TanStack Router resolves same-route navigations with different params as a route swap, which remounts the editor (via `<FragmentEditor key={fragmentId} />` at `FragmentPage.tsx:27`) and re-fires the `recordFragmentVisit` effect. Correct for the spec's "route swap" semantics.
- **`voluntary_open_count` not double-counted** — outside suggestion mode the increment runs once in `FragmentPage`'s mount effect; inside suggestion mode the quick-switcher calls `recordFragmentVisit` directly (and `SuggestionModePage` does not). Total: one bump per pick. Correct.
- **`Switch to…` palette command lives in `project-shell` scope, not `global`** — the scope is mounted iff `ProjectShellLayout` is, which is exactly when the switcher is available. Correctly gates the command without needing a `disabled` reason.
- **Eligibility bypass for `readyStatus === 1.0`** — the suggestion-mode page reads the fragment id from the URL search param and renders `FragmentEditor` directly (`SuggestionModePage/index.tsx:158-171`); there is no eligibility check on this path. Correctly bypasses the engine's filter as the spec requires.
- **No avoidance increment after a quick-switcher pick** — currently passes (Bug 1 explains why); flagged here so a future reviewer doesn't "fix" the cooldown without preserving this property.
