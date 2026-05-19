# Command Palette

**Date**: 19-05-2026
**Status**: Todo
**Specs**: `specifications/command-palette.md`

---

## Goal

> Deliver a command palette as the canonical action surface in the frontend: every non-link UI action dispatches through a command system, the palette opens with `Cmd/Ctrl+K` from any focus, supports view-scoped and global commands grouped by category, runs parameterized commands via a shared two-step picker, and binds hotkeys declared on command definitions — replacing the legacy chord-based navigation.

---

## Tasks

### Phase 1 — Command system foundation

> Internal plumbing only. No user-visible change. Catalogs and palette UI come later.

- [ ] Create branch `command-palette` from `main`
- [ ] `src/lib/commands/types.ts`: `CommandDef` (id, label, scope, category as literal union, hotkey?, arg?, disabledReason?, run); `CommandArg` (items, getKey, getLabel, renderItem, placeholder); category union `'navigation' | 'create' | 'project' | 'other'`
- [ ] `src/lib/commands/CommandsProvider.tsx`: provider holding a ref-backed `Map<id, CommandDef>`; exposes register/unregister and `run(id, arg?)`
- [ ] `src/lib/commands/useCommand.ts`: writes the def into the provider's map on every render, removes on unmount; dev-mode warning on duplicate IDs across mounted components
- [ ] `src/lib/commands/useCommands.ts`: returns `{ run, isAvailable, list }` for consumers (buttons, hotkey binder, palette)
- [ ] `src/lib/commands/registry.ts`: static-registry module exporting an initial empty array of `CommandDef`; loaded by `CommandsProvider` at mount
- [ ] `src/lib/commands/HotkeyBinder.tsx`: a mounted-once child of `CommandsProvider` that subscribes to the command map and binds `keydown` for any command declaring a `hotkey`; respects "skip in text input" only for unmodified single-key hotkeys
- [ ] Mount `CommandsProvider` + `HotkeyBinder` at the app root, above the router
- [ ] Tests: `useCommand` mount/unmount lifecycle; latest-closure invocation after state change; collision warning in dev; `HotkeyBinder` adds/removes listeners with the command lifecycle
- [ ] `bun run verify`
- [ ] `git commit` — "feat(commands): add command system foundation"

### Phase 2 — Migrate existing actions to commands

> Strict migration: every mutation that runs from an `onClick` (or equivalent) becomes a command. Inline `useMutation().mutate(...)` in click handlers is removed in this phase.

- [ ] Inventory mutation call sites (current sweep: `FragmentListPage`, `ProjectManagementPage/components/*`, `NoteEditor`, `OverviewPage`, `OverviewPage/components/SequenceSidebar`, `DraftsPage/*`, `PreviewPage`, `AspectEditor`, `ReferenceEditor`, `ProjectConfigPage/tabs/*`, `ProjectConfigPage/components/ArcEditor`, `fragment-metadata-form`, `fragment-editor`). Record the list as a checklist below before starting work.
- [ ] For each call site, decide static-registry vs `useCommand` per spec rules (state-free → static; closure-dependent → hook)
- [ ] Convert each `onClick` to `commands.run('<id>')` and register the command alongside the component (or in the static registry)
- [ ] Keep `<Link>` elements untouched — only non-link actions migrate
- [ ] Verify per-component: existing tests still pass; add a smoke test for any component lacking one to confirm the migrated action still runs
- [ ] Grep guard: no `onClick` handler in any button calls a `*Mutation().mutate(...)` directly. Document the check in the commit message.
- [ ] `bun run verify`
- [ ] `git commit` — "refactor(frontend): route all UI actions through the command system"

### Phase 3 — Shared `Picker` primitive

> The component that powers the palette, the parameterized arg step, and (later) the entity quick-open.

- [ ] `src/components/picker/Picker.tsx`: wraps `cmdk` + Radix Dialog; props `{ items, getKey, getLabel, renderItem?, placeholder, open, onOpenChange, onSelect }`
- [ ] Built-in cmdk subsequence scoring (no custom filter in v1)
- [ ] "No items found" empty state
- [ ] Focus trap + restoration via Radix Dialog (inherited)
- [ ] Tests: filters items by query; arrow keys + Enter select; Esc closes; focus returns to prior element
- [ ] `git commit` — "feat(picker): add shared Picker primitive"

### Phase 4 — Command palette UI

> First user-visible slice.

- [ ] `src/components/command-palette/CommandPalette.tsx`: consumes `useCommands().list` and the `Picker`
- [ ] Sections: view-scoped first (heading is the scope name), then global sections by category (`Navigation`, `Create`, `Project`, `Other`); alphabetical within each section
- [ ] Hotkey shown right-aligned per row, dimmed; modifier glyphs (`⌘`, `⌃`, `⇧`) rendered consistently
- [ ] Disabled-with-explanation rendering: dimmed, `disabledReason` shown after the label, ordered last in its section
- [ ] Global trigger bindings: `Cmd/Ctrl+K` (primary), `Cmd/Ctrl+Shift+P` (secondary). Bind at the provider level so editor focus does not block them.
- [ ] Editor key precedence: configure Tiptap and CodeMirror so they yield `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+P`, and `Cmd/Ctrl+O` (the entity quick-open key, reserved for a sibling spec)
- [ ] Mount the palette inside `CommandsProvider`, available on every authenticated/project route
- [ ] Tests: opens from body focus; opens from inside Tiptap; opens from inside CodeMirror; Esc closes and restores focus; sections render in the prescribed order; hotkey strings render correctly; "No commands found" appears on no-match
- [ ] Update `specifications/command-palette.md` `Shipped:` with the slice that landed
- [ ] `bun run verify`
- [ ] `git commit` — "feat(command-palette): add palette UI with global trigger"

### Phase 5 — Parameterized commands

- [ ] Extend `CommandPalette` with a two-step mode: selecting a command with `arg` transitions the same modal to an argument picker (also a `Picker`)
- [ ] `Esc` from the argument picker returns to the command list with the prior query restored
- [ ] Zero-item arg: command renders disabled with explanation in the command list (no transition possible)
- [ ] Loading state for arg items: skeleton rows in the argument picker
- [ ] Failure: close the palette and surface the error via the existing toast mechanism
- [ ] Tests: ellipsis command opens arg picker; selecting an item invokes `run(arg)`; Esc returns to command list with restored query; zero-item command is disabled with explanation
- [ ] Update spec `Shipped:`
- [ ] `git commit` — "feat(command-palette): support parameterized two-step commands"

### Phase 6 — Initial global catalog

> Populate the static registry with the v1 global commands so the palette is actually useful end-to-end.

- [ ] Navigation: `Go to Overview`, `Go to Fragment list`, `Go to Drafts`, `Go to Preview`, `Go to Project config`, `Go to Stats`, `Go to History`, `Go to Project management`
- [ ] Create: `Create fragment…`, `Create note…`, `Create reference…`, `Create aspect…` (open the existing creation flows; parameterized later if needed)
- [ ] Project: `Switch project…` (parameterized — projects from registry), `Switch sequence…` (parameterized — sequences in current project), `Export sequence…`
- [ ] Decide whether the palette is mounted shell-wide (works on `/` for `Create project…`) or project-shell-only; resolve the open question in the spec before merging
- [ ] Tests: each registered command runs and lands on the expected route or invokes the expected mutation
- [ ] Update spec `Shipped:` + close the relevant open question
- [ ] `git commit` — "feat(command-palette): populate global command catalog"

### Phase 7 — Chord nav removal

> Blocked on the post-chord hotkey scheme decision (see Notes).

- [ ] Decide final scheme for global navigation hotkeys (modifier-prefixed `Cmd+1..N` vs unmodified single letters that skip text inputs)
- [ ] Declare nav hotkeys on the corresponding static commands
- [ ] Delete `src/hooks/useKeyboardNav.ts` and remove its mount from `ProjectShellLayout`
- [ ] Update tests that referenced the chord shortcuts
- [ ] Update `specifications/navigation.md` `Shipped:` and `specifications/command-palette.md` `Shipped:`; close the remaining open question in the palette spec
- [ ] `git commit` — "refactor(navigation): replace chord shortcuts with command-bound hotkeys"

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Per-phase emphasis:

- Phase 1: unit tests for the registry/hook lifecycle and the hotkey binder — these are the load-bearing primitives. Treat them as long-lived; the rest of the system depends on them.
- Phase 2: rely on existing component tests where they exist; add smoke tests where they do not. The goal is no behavioral regression in any migrated action.
- Phase 4 & 5: integration tests that open the palette from realistic focus states (Tiptap, CodeMirror) and exercise the full keyboard flow.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.

**Open question blocking Phase 7**: post-chord hotkey scheme — modifier-prefixed (`Cmd+1`, `Cmd+2`, …) vs unmodified single letters skipping text inputs. Resolve before starting Phase 7. Phases 1–6 do not depend on this; chord nav and the new command system coexist until Phase 7.

**Phase 2 is the highest-touch phase.** Many small components change. Work component-by-component, verify each, and consider landing it as a single dedicated PR/commit to keep the diff reviewable.

**Phase 6 resolves the "palette on `/`" open question.** Surface the decision in the spec before implementing.
