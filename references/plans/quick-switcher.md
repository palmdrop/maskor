# Quick-switcher

**Date**: 25-05-2026
**Status**: Todo
**Specs**: `specifications/quick-switcher.md`, `specifications/prompting.md`, `specifications/command-palette.md`

---

## Goal

A writer can press `Cmd/Ctrl+O` from any view in an active project, see a fuzzy-searchable list of every selectable entity (fragments, aspects, notes, references, sequences), and pick one — landing in the right view per the open-semantics rules in `specifications/quick-switcher.md`, including the suggestion-mode swap-in-place case with correct stat accounting.

---

## Tasks

### Phase 1 — Branch and data foundations

- [ ] Create branch `quick-switcher` from `main`
- [ ] Inventory generated orval hooks for entity lists: fragments, aspects, notes, references, sequences. Each list must return at minimum `{ uuid, key }`; fragments must additionally expose `isDiscarded` and `readyStatus`
- [ ] If a list endpoint is missing, or doesn't expose the required fields, add the route to the API, run `bun run codegen` in `packages/frontend`, and consume the regenerated hook (no hand-rolled queries — per `packages/frontend/CLAUDE.md`)
- [ ] `git commit` — checkpoint only if API changes landed

### Phase 2 — `QuickSwitcher` component

- [ ] `src/components/quick-switcher/QuickSwitcher.tsx`: project-scoped modal built as a direct cmdk + Radix Dialog consumer (the existing `Picker` primitive is flat-only; the switcher needs grouped empty-query rendering, so do not bloat `Picker` — follow the same pattern `CommandPalette` used when it outgrew `Picker`)
- [ ] Internal model: `{ uuid, key, type: 'fragment' | 'aspect' | 'note' | 'reference' | 'sequence' }`. Merge the five hook results into this shape at the boundary; filter out discarded fragments
- [ ] Empty query: grouped sections in the order Fragments, Aspects, Notes, References, Sequences; alphabetical within each section; empty groups omitted entirely
- [ ] Typed query: flat ranked list using cmdk's built-in subsequence scoring; type chips remain on every row; no grouping, no per-type ordering
- [ ] Row format: type chip (left, always shown), key (center). Reuse the chip styling pattern from `CommandPalette`'s scope chip
- [ ] `"No matches"` empty state; `"This project is empty…"` empty state when the project has zero entities of any type
- [ ] Loading state: skeleton rows per group, matching the parameterized-arg skeletons from `command-palette` phase 5
- [ ] Failure path: close the switcher and surface the error via the existing toast/console path
- [ ] `git commit` — "feat(quick-switcher): add QuickSwitcher component shell"

### Phase 3 — Global binding and shell mounting

- [ ] `Cmd/Ctrl+O` global trigger via capture-phase window listener (same pattern the palette uses for `Cmd/Ctrl+K`); binding is inert outside an active project
- [ ] Mount the switcher inside `ProjectShellLayout` so it's available only when a project is active, matching the project-scoped scope of the feature
- [ ] Verify editor extensions (Tiptap, CodeMirror) already yield `Cmd/Ctrl+O` (reserved alongside `Cmd/Ctrl+K` in `command-palette.md`). If the precedence config is missing, add it analogous to the `Cmd/Ctrl+K` setup
- [ ] `Esc` closes the switcher; focus returns to the previously focused element (inherited from Radix Dialog)
- [ ] `git commit` — "feat(quick-switcher): bind Cmd/Ctrl+O and mount in project shell"

### Phase 4 — Open semantics (non-suggestion-mode cases)

- [ ] `resolveOpenTarget(currentRoute, pickedEntity)`: pure function returning a typed result mapping every row of the open-semantics table in `specifications/quick-switcher.md` to either `{ kind: 'navigate', path }` or `{ kind: 'swap-in-place' }`
- [ ] Fragment pick → `router.navigate('/fragments/:uuid')`. Same-route navigation when already on the Fragment editor is the route-swap case. The existing unsaved-changes prompt (per `navigation.md`) fires automatically
- [ ] Aspect pick → navigate to the aspect editor for the picked aspect (route-swap when already on aspect editor)
- [ ] Note / reference pick → navigate to the attachment editor for the picked entity
- [ ] Sequence pick → set active sequence + navigate to Overview. When already on Overview, swap the active sequence in place
- [ ] `git commit` — "feat(quick-switcher): implement open semantics for non-suggestion-mode routes"

### Phase 5 — Suggestion-mode integration

- [ ] In suggestion mode, a fragment pick sets the active suggestion-mode fragment via the existing query-param mechanism (shipped 2026-05-23 per `prompting.md`); the switcher does NOT call `router.navigate` away from the suggestion route
- [ ] Confirm the suggestion-mode loader reads from the query param and does NOT re-invoke the prompting engine when the param changes by quick-switcher action
- [ ] Eligibility bypass: a quick-switcher pick must load the fragment even when the engine would exclude it (`readyStatus === 1.0`, in cooldown). Verify the param-driven load path does not re-apply eligibility filters
- [ ] `voluntary_open_count++`: confirm the existing fragment-open path increments this stat for any user-initiated load. If the increment is currently scoped to "outside suggestion mode" only, broaden the trigger so it fires for quick-switcher loads inside suggestion mode too. May require API + codegen update
- [ ] `avoidance_count`: pressing `Next` after a quick-switcher pick must NOT increment `avoidance_count`. Carry a "this load was user-initiated" flag in suggestion-mode state so the avoidance check can branch on it
- [ ] Cooldown: pressing `Next` after a quick-switcher pick must enter the picked fragment into cooldown — same behavior as engine-surfaced picks. Verify with a test
- [ ] `git commit` — "feat(quick-switcher): integrate with suggestion mode (swap-in-place + stat accounting)"

### Phase 6 — Palette composition refactor

- [ ] Remove the standalone `Switch sequence…` command from the palette catalog (added in `command-palette` plan phase 6); delete the parameterized arg loader and any tests specific to it
- [ ] Add a generic `Switch to…` global command (no `arg`); its `run` opens the quick-switcher. Category: `navigation` (most natural fit) — confirm during review or introduce a more accurate category
- [ ] `Switch project…` palette command is unchanged
- [ ] Update `specifications/command-palette.md` `Shipped:` to record the removal of `Switch sequence…` and the addition of `Switch to…`
- [ ] `git commit` — "refactor(command-palette): replace Switch sequence… with generic Switch to… launching the quick-switcher"

### Phase 7 — Tests, verification, and spec frontmatter

- [ ] `QuickSwitcher` rendering: empty query renders grouped sections in the prescribed order with empty groups omitted; typed query renders a flat ranked list with type chips; `"No matches"` appears when nothing matches
- [ ] Discarded fragments are absent from the catalog; fragments with `readyStatus === 1.0` are present and selectable
- [ ] A `key` shared across two entity types (e.g. fragment `river` and note `river`) shows two rows, disambiguated by type chip
- [ ] `resolveOpenTarget` unit tests cover every row in the open-semantics table
- [ ] Suggestion-mode integration tests: pick → swap-in-place (no route change); pick → `voluntary_open_count++`; pick + `Next` → no `avoidance_count` increment; pick + `Next` → cooldown applies; pick of a `readyStatus === 1.0` fragment loads (eligibility bypass)
- [ ] Palette behavior: `Switch sequence…` is gone; `Switch to…` opens the quick-switcher
- [ ] Editor extensions do not consume `Cmd/Ctrl+O` (regression test analogous to the existing `Cmd/Ctrl+K` one)
- [ ] `bun run verify`
- [ ] Update `specifications/quick-switcher.md` `Shipped:` with the slice that landed (initial implementation: binding, unified catalog, open semantics, suggestion-mode integration, palette refactor)
- [ ] `git commit` — "test(quick-switcher): cover behaviour and update spec frontmatter"

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
