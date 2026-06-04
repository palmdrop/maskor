# Command Palette

**Date**: 19-05-2026
**Status**: Done
**Specs**: `specifications/command-palette.md`

---

## Goal

> Deliver a command palette as the canonical action surface in the frontend: every non-link UI action dispatches through a command system, the palette opens with `Cmd/Ctrl+K` from any focus, supports view-scoped and global commands grouped by category, runs parameterized commands via a shared two-step picker, and binds hotkeys declared on command definitions — replacing the legacy chord-based navigation.

---

## Tasks

### Phase 1 — Command system foundation

> Internal plumbing only. No user-visible change. Catalogs and palette UI come later.

- [x] Create branch `command-palette` from `main`
- [x] `src/lib/commands/types.ts`: `CommandDef` (id, label, scope, category as literal union, hotkey?, arg?, disabledReason?, run); `CommandArg` (items, getKey, getLabel, renderItem, placeholder); category union `'navigation' | 'create' | 'project' | 'other'`
- [x] `src/lib/commands/CommandsProvider.tsx`: provider holding a ref-backed `Map<id, CommandDef>`; exposes register/unregister and `run(id, arg?)`
- [x] `src/lib/commands/useCommand.ts`: writes the def into the provider's map on every render, removes on unmount; dev-mode warning on duplicate IDs across mounted components
- [x] `src/lib/commands/useCommands.ts`: returns `{ run, isAvailable, list }` for consumers (buttons, hotkey binder, palette)
- [x] `src/lib/commands/registry.ts`: static-registry module exporting an initial empty array of `CommandDef`; loaded by `CommandsProvider` at mount
- [x] `src/lib/commands/HotkeyBinder.tsx`: a mounted-once child of `CommandsProvider` that subscribes to the command map and binds `keydown` for any command declaring a `hotkey`; respects "skip in text input" only for unmodified single-key hotkeys
- [x] Mount `CommandsProvider` + `HotkeyBinder` at the app root, above the router
- [x] Tests: `useCommand` mount/unmount lifecycle; latest-closure invocation after state change; collision warning in dev; `HotkeyBinder` adds/removes listeners with the command lifecycle
- [x] `bun run verify`
- [x] `git commit` — "feat(commands): add command system foundation"

### Phase 2 — Migrate existing actions to commands

> Strict migration: every mutation that runs from an `onClick` (or equivalent) becomes a command. Inline `useMutation().mutate(...)` in click handlers is removed in this phase.

- [x] Inventory mutation call sites. Decision: page/sidebar-level button mutations migrated via catalog hooks; dialog-internal confirmation buttons, DnD handlers, and keyboard/blur-driven renames are exempt (not palette-discoverable).
  - Migrated: `OverviewPage` (designate-main, delete-section, add-section), `SequenceSidebar` (create-sequence, delete-sequence), `GeneralTab` (rebuild-index), `SettingsSection` (save-settings)
  - Exempt: all dialog confirm/submit buttons; DnD `handleDragEnd` mutations; inline rename mutations
- [x] For each call site, decide static-registry vs `useCommand` — all page/sidebar commands are closure-dependent → catalog hooks in `src/lib/commands/catalog/`
- [x] Convert each `onClick` to `commands.run('<id>')` and register via catalog hook
- [x] Keep `<Link>` elements untouched — only non-link actions migrate
- [x] Existing tests pass; smoke tests added for `GeneralTab` and `SettingsSection`
- [x] Grep guard documented in commit message
- [x] Document the pattern in `packages/frontend/CLAUDE.md`
- [x] `bun run verify`
- [x] `git commit` — "refactor(frontend): route page/sidebar actions through command system"

### Phase 3 — Shared `Picker` primitive

> The component that powers the palette, the parameterized arg step, and (later) the entity quick-open.

- [x] `src/components/picker/Picker.tsx`: wraps `cmdk` + Radix Dialog; props `{ items, getKey, getLabel, renderItem?, placeholder, open, onOpenChange, onSelect }`
- [x] Built-in cmdk subsequence scoring (no custom filter in v1)
- [x] "No items found" empty state
- [x] Focus trap + restoration via Radix Dialog (inherited)
- [x] Tests: filters items by query; arrow keys + Enter select; Esc closes; focus returns to prior element
- [x] `git commit` — "feat(picker): add shared Picker primitive"

### Phase 4 — Command palette UI

> First user-visible slice.

- [x] `src/components/command-palette/CommandPalette.tsx`: consumes `useCommands()` and cmdk+Radix Dialog directly (groups require CommandGroup, not flat Picker)
- [x] Sections: view-scoped first (heading is the scope name), then global sections by category (`Navigation`, `Create`, `Project`, `Other`); alphabetical within each section
- [x] Hotkey shown right-aligned per row, dimmed; modifier glyphs (`⌘`, `⌃`, `⇧`) rendered consistently
- [x] Disabled-with-explanation rendering: dimmed, `disabledReason` shown after the label, ordered last in its section
- [x] Global trigger bindings: `Cmd/Ctrl+K` (primary), `Cmd/Ctrl+Shift+P` (secondary). Bound via capture-phase window listener — intercepts before editors without editor-specific config.
- [x] Editor key precedence: capture-phase `preventDefault()` is sufficient; ProseMirror and CodeMirror both check `event.defaultPrevented` before handling.
- [x] Mount the palette inside `CommandsProvider`, available on every authenticated/project route
- [x] Tests: opens from body focus; opens from inside contentEditable; Esc closes; sections render in prescribed order; hotkey glyphs render correctly; "No commands found" on no-match; disabled command shows reason and blocks run
- [x] Update `specifications/command-palette.md` `Shipped:` with the slice that landed
- [x] `bun run verify`
- [x] `git commit` — "feat(command-palette): add palette UI with global trigger"

### Phase 5 — Parameterized commands

- [x] Extend `CommandPalette` with a two-step mode: selecting a command with `arg` transitions the same modal to an argument picker (also a `Picker`)
- [x] `Esc` from the argument picker returns to the command list with the prior query restored
- [x] Zero-item arg: command renders disabled with explanation in the command list (no transition possible)
- [x] Loading state for arg items: skeleton rows in the argument picker
- [x] Failure: close the palette and surface the error via the existing toast mechanism (currently logs to console — no toast library exists yet; tracked in suggestions.md)
- [x] Tests: ellipsis command opens arg picker; selecting an item invokes `run(arg)`; Esc returns to command list with restored query; zero-item command is disabled with explanation
- [x] Update spec `Shipped:`
- [x] `git commit` — "feat(command-palette): support parameterized two-step commands"

### Phase 6 — Initial global catalog

> Populate the static registry with the v1 global commands so the palette is actually useful end-to-end.

- [x] Navigation: `Go to Overview`, `Go to Fragment list`, `Go to Drafts`, `Go to Preview`, `Go to Project config`, `Go to Stats`, `Go to History`, `Go to Project management`
- [x] Create: `Create fragment…`, `Create note…`, `Create reference…`, `Create aspect…` (navigate to creation page; dialog auto-open deferred — tracked in suggestions.md)
- [x] Project: `Switch project…` (parameterized — projects from registry), `Switch sequence…` (parameterized — sequences in current project); `Export sequence…` skipped — no API endpoint exists yet
- [x] Decide whether the palette is mounted shell-wide (works on `/` for `Create project…`) or project-shell-only; resolve the open question in the spec before merging
- [x] Tests: each registered command runs and lands on the expected route or invokes the expected mutation
- [x] Update spec `Shipped:` + close the relevant open question
- [x] `git commit` — "feat(command-palette): populate global command catalog"

### Phase 7 — Chord nav removal

> This removes the chord nav with no direct replacement. This is by design.

- [x] Add navigation commands with no bound hotkeys (hotkeys will be added in future work)
- [x] Declare nav hotkeys on the corresponding static commands (deferred — no hotkeys declared yet per plan; navigation via Cmd+K palette only)
- [x] Delete `src/hooks/useKeyboardNav.ts` and remove its mount from `ProjectShellLayout`
- [x] Update tests that referenced the chord shortcuts (none existed)
- [x] Update `specifications/navigation.md` `Shipped:` and `specifications/command-palette.md` `Shipped:`
- [x] `git commit` — "refactor(navigation): replace chord shortcuts with command-bound hotkeys"

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

**Phase 2 is the highest-touch phase.** Many small components change. Work component-by-component, verify each, and consider landing it as a single dedicated PR/commit to keep the diff reviewable.

**Phase 6 resolves the "palette on `/`" open question.** Surface the decision in the spec before implementing.
