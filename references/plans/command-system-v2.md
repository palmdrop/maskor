# Command System v2 — typed scope-context refactor

**Date**: 25-05-2026
**Status**: Todo
**Specs**: `specifications/command-palette.md`

---

## Goal

> Replace the per-component `useCommand` registration model with a typed scope-context system: views publish a typed context object, command logic lives in command files (not components), `commands.run(id, arg)` is fully type-safe with autocomplete, hotkeys are declared on command definitions, and the only way to trigger a palette-eligible action is through `commands.run`. View-contextual commands may stack with global commands and with each other; multiple scopes can be active simultaneously and the palette shows them innermost-first.

---

## Architecture summary

> Non-negotiable shape that every phase below must respect. If something here turns out to be wrong during implementation, **stop and revisit the plan** rather than drifting.

### Scope

A **scope** is a logical mode the user can be in (e.g., "suggestion mode", "fragment editor"). Each scope declares a typed **context** (state + primitive action functions). Components mount a scope by calling `useCommandScope(scope, ctx)`; commands declared against that scope receive `ctx` as their first argument.

- Scopes are **singletons**. `useCommandScope` warns in dev if the scope is already published; last-publish-wins in prod.
- A scope is **active** iff a component has it mounted with a context. Active scopes' commands appear in the palette; their hotkeys are live. Inactive scopes' commands are invisible and inert.
- Multiple scopes can be active simultaneously (e.g., `FragmentEditor` scope inside `SuggestionMode` scope). Palette sections render **innermost-first** (most recently mounted), then global by category.

### Context freshness

The provider holds a ref to the latest published context per scope. Components re-publish on every render; commands always read the latest value at `run` time. No re-registration churn.

### Commands

Two builders, both used at module scope (side-effect imports):

- `defineGlobalCommand(def)` — static commands. `run` takes no context (or only `arg`).
- `defineScopeCommand(scope, def)` — `run(ctx, arg?)` is typed against the scope's context.

Each builder pushes into a module-level registry. A barrel file `commands/index.ts` side-effect-imports every command file, guaranteeing both runtime registration and type-union completeness. Missing the barrel = command absent at runtime AND from the `CommandId` union (consistent failure mode).

### Disabled state

`disabled: (ctx) => string | undefined` is a pure function on the command. Palette evaluates lazily when it renders / on query change. Components publish raw state (`isLoading`, `hasPrevious`); the command translates it into the displayed reason.

### Enforcement

"No bypass" is structural, not lint-based:

- Components publish **primitives** (`loadNext`, `goBack`) — small, single-purpose, palette-ineligible building blocks.
- Composed actions (`handleNext` = save + loadNext) live in the command file.
- Buttons dispatch via `commands.run("suggestion:next")` — the only way to trigger the composed action.

### Typing

`commands.run<Id extends CommandId>(id: Id, ...args: ArgsFor<Id>)`. Autocomplete on `id`; arg type inferred per command. `defineScopeCommand(scope, def)` enforces at definition time that `def.run`'s `ctx` parameter matches `scope`'s context type.

### File layout

```
src/lib/commands/
  define.ts                  # defineScope, defineGlobalCommand, defineScopeCommand
  registry.ts                # module-level arrays + getters (no UI)
  CommandsProvider.tsx       # holds active scope contexts + exposes run/list/getActiveScopes
  HotkeyBinder.tsx           # binds hotkeys from active commands
  useCommandScope.ts         # publishes ctx for a scope
  useCommands.ts             # typed { run, isAvailable, list }
  types.ts                   # public types: CommandId, ArgFor<Id>, ScopeId, ContextFor<Scope>, CommandDef
  index.ts                   # BARREL — side-effect imports every command file; re-exports public API
  global/
    navigation.ts
    create.ts
    project.ts
  scopes/
    suggestion-mode.ts       # one file per scope; declares scope + all its commands; split if it gets big
    fragment-editor.ts
    overview.ts
    sequence-sidebar.ts
    project-config.ts
    project-management.ts
    fragment-import.ts
    fragment-metadata.ts
    editor-extract.ts
    editor-insert.ts
    editor-save.ts
    editor-extract-and-insert.ts
```

---

## Tasks

### Phase 1 — Branch + new foundation (parallel to old)

> Build the new primitives alongside the existing system. The old `useCommand` / catalog-hooks pattern keeps working through this phase. No user-visible change.

- [ ] Create branch `command-system-v2` from `main`
- [ ] `commands/types.ts` (v2): public types — `ScopeId`, `CommandId`, `ContextFor<Scope>`, `ArgFor<Id>`, `CommandDef`. Strong inference: `defineScopeCommand` infers `ctx` from the scope's declared context type
- [ ] `commands/define.ts`: `defineScope<Ctx>(id, { label }) → Scope<Ctx>`; `defineGlobalCommand(def)`; `defineScopeCommand(scope, def)`. All push into module-level registry arrays exported by `registry.ts`
- [ ] `commands/registry.ts`: module-level arrays for globals + per-scope commands; pure data, no React
- [ ] `commands/CommandsProvider.tsx` (rewrite): holds (a) active scope contexts (`Map<ScopeId, { ctx, mountOrder }>`), (b) re-exposes static registry contents. `run(id, arg?)` looks up the def, finds its scope's active ctx (if scoped), evaluates `disabled(ctx)`, calls `run(ctx, arg)`. Dev warning on duplicate scope mount. Mount-order counter increments per `useCommandScope` mount
- [ ] `commands/useCommandScope.ts`: `useCommandScope<S extends Scope<Ctx>>(scope, ctx)` — registers scope as active on mount (assigns mount-order index), keeps ref to latest ctx on every render, unregisters on unmount
- [ ] `commands/useCommands.ts`: typed `run<Id extends CommandId>(id, ...args)`, `isAvailable(id)`, `list()` returning active+globals
- [ ] `commands/HotkeyBinder.tsx` (rewrite): iterates active scope commands + globals; same modifier parsing as today; respects "skip in text input" rule for unmodified single-key hotkeys; innermost-scope wins on conflict (dev warn)
- [ ] `commands/index.ts`: barrel — side-effect imports for every (future) command file under `global/` and `scopes/`. For now, empty `global/` and `scopes/` directories
- [ ] Mount the new provider + hotkey binder. Decision: replace the existing mount points (`CommandsProvider`, `HotkeyBinder`) with the v2 versions, but keep the old `useCommand` hook adapter (next item) so existing catalog hooks continue to function
- [ ] **Adapter shim**: keep `useCommand` (old) working by translating each registration into an ad-hoc "ungrouped global" entry in the v2 provider. Adapter is marked TODO and deleted in the final phase. This is the only piece of dual-system glue
- [ ] Tests: scope mount/unmount lifecycle (mount-order, dev warning on duplicate); context freshness across renders; typed `run` (TS-level test or `expect-type`); `HotkeyBinder` adds/removes listeners with active scope changes; innermost-wins hotkey conflict warning
- [ ] `bun run verify`
- [ ] `git commit` — "feat(commands): add typed scope-context foundation (v2)"

### Phase 2 — Migrate global commands

> Convert all `scope: "global"` commands to `defineGlobalCommand` in `commands/global/*`. Remove them from the old `registry.ts` and from `useProjectShellCommands` / `useProjectManagementCommands`. Adapter shim handles whatever remains until phase 5.

- [ ] `commands/global/navigation.ts`: all `navigation:go-to-*` commands. Project-scoped navigation reads `projectId` from the router directly (`router.state.matches`) instead of taking it as an argument. If no project is active, the command shows disabled with reason "No active project"
- [ ] `commands/global/create.ts`: `create:fragment`, `create:note`, `create:reference`, `create:aspect`. Same approach for `projectId`. Open question deferred from original plan: navigate-to-creation-page vs auto-open dialog — keep current behavior (navigate)
- [ ] `commands/global/project.ts`: `project:switch-project` (lists projects), `project:switch-sequence` (lists sequences in active project). Sequence switch is disabled with reason "No active project" if none
- [ ] Delete the old global entries: remove from `registry.ts`, remove from `useProjectShellCommands` and `useProjectManagementCommands` (these hooks become empty for now and are removed at the call sites in phase 5)
- [ ] Smoke tests: each global command runs and lands on the expected route or invokes the expected mutation. Reuse / move the tests from `command-palette` Phase 6
- [ ] `bun run verify`
- [ ] `git commit` — "refactor(commands): migrate global commands to defineGlobalCommand"

### Phase 3 — Migrate first scope end-to-end (suggestion-mode)

> Proof-of-concept migration. Validates the API before doing the rest. If the API needs adjustment, do it here.

- [ ] `commands/scopes/suggestion-mode.ts`: `defineScope("suggestion-mode", { label: "Suggestion mode" })<SuggestionModeContext>()`. Context: `{ fragmentId: string | null; editorRef: RefObject<FragmentEditorHandle>; isLoading: boolean; hasPrevious: boolean; loadNext: (excludeUuid?: string) => Promise<void>; goBack: () => void }`
- [ ] In the same file, `defineScopeCommand(scope, { id: "suggestion:next", ... })` — `run(ctx)` does `await ctx.editorRef.current?.save(); await ctx.loadNext(ctx.fragmentId ?? undefined)`. `disabled: (ctx) => ctx.isLoading ? "Loading…" : undefined`. Hotkey `mod+enter`
- [ ] `defineScopeCommand(scope, { id: "suggestion:previous", ... })` — `run(ctx) => ctx.goBack()`. `disabled: (ctx) => !ctx.hasPrevious ? "No previous fragment" : undefined`
- [ ] `SuggestionModePage`: delete `handleNext` and `useSuggestionModeCommands`. Call `useCommandScope(suggestionModeScope, { fragmentId, editorRef, isLoading: isLoadingNext, hasPrevious: router.history.canGoBack(), loadNext, goBack })`. Buttons keep dispatching via `commands.run("suggestion:next")` (already do)
- [ ] Delete `catalog/useSuggestionModeCommands.ts`
- [ ] Tests: scope mounts on page load and unmounts on navigation; `commands.run("suggestion:next")` saves the editor and loads next; disabled reason flips with `isLoadingNext`
- [ ] `bun run verify`
- [ ] `git commit` — "refactor(commands): migrate suggestion-mode scope to v2"

### Phase 4 — Migrate remaining scopes

> Mechanical. Each scope follows the suggestion-mode pattern. Land each as its own commit so individual migrations stay reviewable.

- [ ] `scopes/overview.ts` — migrate `useOverviewCommands`. Context exposes `canDesignateMain`, `createSectionPending`, `confirmingDeleteSectionId`, plus primitives `designateMain`, `createSection`, `deleteSection`. Delete catalog hook. Update `OverviewPage`. Commit
- [ ] `scopes/sequence-sidebar.ts` — migrate `useSequenceSidebarCommands`. Delete catalog hook. Update `SequenceSidebar`. Commit
- [ ] `scopes/fragment-editor.ts` — migrate `useFragmentEditorCommands`. Context: `{ hasFragment, isDiscarded, discard, restore }`. Delete catalog hook. Update `FragmentEditor`. Commit
- [ ] `scopes/fragment-import.ts` — migrate `useFragmentImportCommands`. Delete catalog hook. Update call sites. Commit
- [ ] `scopes/fragment-metadata.ts` — migrate `useFragmentMetadataCommands`. Delete catalog hook. Update call sites. Commit
- [ ] `scopes/project-config.ts` — migrate `useProjectConfigCommands`. Delete catalog hook. Update `GeneralTab` / `SettingsSection`. Commit
- [ ] `scopes/project-management.ts` — migrate the **non-global** parts of `useProjectManagementCommands` (globals already moved in phase 2). Delete catalog hook. Commit
- [ ] `scopes/editor-extract.ts`, `editor-insert.ts`, `editor-save.ts`, `editor-extract-and-insert.ts` — these are editor-internal command sets. Investigate whether they need separate scopes or one shared "editor" scope; collapse if context overlaps. Delete catalog hooks. Update call sites. Commit
- [ ] `bun run verify` after each migration
- [ ] Final commit per scope as it lands

### Phase 5 — Palette + final cleanup

> Update the palette to consume v2 directly. Delete the old system entirely.

- [ ] `CommandPalette.tsx`: replace `useCommandsContext` access with v2 `useCommands`. Section ordering: active scopes in mount-order **innermost-first** (most recently mounted), then global sections by category in the existing order (`Navigation` → `Create` → `Project` → `Other`). Heading per scope uses `scope.label`
- [ ] Snapshot-at-open behavior preserved: section grouping/order frozen per opening; per-row state stays live via context ref
- [ ] Hotkey display unchanged (existing `HotkeyBadge` + `formatHotkeyParts`)
- [ ] Delete the adapter shim from `CommandsProvider`
- [ ] Delete old files: `useCommand.ts` (old), the entire `catalog/` directory, old `registry.ts` if any vestigial entries remain
- [ ] Delete now-empty catalog hook call sites in components
- [ ] Update `packages/frontend/CLAUDE.md`: replace the "command system" section with the v2 pattern — scope context, `useCommandScope`, command files own logic, examples
- [ ] Update `specifications/command-palette.md` `Shipped:` with the v2 refactor
- [ ] Tests: palette renders innermost-first when two scopes are active; deleting the adapter doesn't break any remaining flow
- [ ] `bun run verify`
- [ ] `bun run snapshot`
- [ ] `git commit` — "refactor(commands): remove v1 system, palette consumes v2"

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Per-phase emphasis:

- Phase 1: type-level tests for `commands.run` autocomplete + arg inference (use `expect-type` or `tsd`-style assertions); runtime tests for scope lifecycle, context freshness, hotkey binder.
- Phase 3: integration test that exercises the full `useCommandScope` + `commands.run` flow on a real page.
- Phase 4: rely on existing component smoke tests where present; only add tests when migration changes behavior (it shouldn't — this is a pure refactor).
- Phase 5: palette integration tests with two simultaneous active scopes (mount `FragmentEditor` inside `SuggestionModePage`-like wrapper, open palette, verify section order).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update `specifications/command-palette.md` `Shipped:` with the v2 refactor. Do not include implementation details or granular tasks.

**Phase 4 is the highest-touch phase.** Many scopes migrate independently. Land each as its own commit so a regression in one scope doesn't block the rest.

**Phase 1's adapter shim is a one-way bet.** It exists only so phases 2–4 can land incrementally with a working app. It must be deleted in phase 5. Do not let other code grow to depend on it.
