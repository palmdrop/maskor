# Spec: Command Palette

**Status**: Draft
**Last updated**: 2026-05-19

---

## Outcome

The user can press a single key from anywhere in the app and reach any action — global ones (create, navigate, export) and view-specific ones (next fragment, toggle vim mode, swap a fragment file). The palette is the canonical surface for every action; UI buttons and hotkeys are alternative entry points to the same underlying commands.

---

## Scope

### In scope

- A modal command palette opened by a global keyboard shortcut, available on every route once a project is active.
- A unified command system: every non-link UI action in the frontend is a registered command. Buttons, hotkeys, and the palette all dispatch through it.
- A hybrid command registry: a static module for global commands, a `useCommand` hook for view-scoped commands that close over view state.
- Parameterized commands via a two-step picker (command → argument → run).
- A shared `Picker` primitive that the palette, the parameterized argument picker, and the future entity quick-open all build on.
- Hotkey binding driven by command definitions (no separate hotkey config).
- Visual grouping: view-scoped commands first, then globals by category, alphabetical within groups, with hotkeys shown inline.

### Out of scope

- **Entity quick-open** (fragments, notes, references, aspects, projects). Sibling spec, opened with `Cmd/Ctrl+O`, shares the `Picker` primitive.
- **User-configurable hotkey rebinding.** Architecture must support it; v1 ships with fixed bindings declared in the registry.
- **Recent / frequent boosting.** Palette ordering is deterministic in v1.
- **Free-text argument input.** Parameterized commands pick from a closed item set only.
- **Chained multi-argument commands.** Single argument step only.
- **LLM-assisted command matching.** Only deterministic subsequence scoring (vision: no LLMs).
- **Plugin / extension system.** All commands ship in the codebase.
- **Mobile / touch input.**
- **Programmatic command invocation from outside React.** Commands are invoked from React-tree code (buttons, hotkey handlers, the palette).

---

## Behavior

### Trigger and focus

- `Cmd/Ctrl+K` (primary) opens the palette from any focus — including the Tiptap prose editor and CodeMirror raw/vim editor.
- `Cmd/Ctrl+Shift+P` is also bound as a secondary trigger for VSCode/Obsidian muscle memory. In Firefox this binding is claimed by the browser (private window) and cannot be overridden; the primary `Cmd/Ctrl+K` is the documented fallback.
- The palette is a focus-trapped modal. On close, focus returns to the previously focused element so a writer can resume typing mid-sentence.
- `Esc` closes the palette. `Esc` from inside an argument picker returns to the command list with the prior query restored.
- Editor extensions (Tiptap, CodeMirror) MUST NOT capture `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+P`, or `Cmd/Ctrl+O`. The global palette bindings take precedence.

### Command catalog

The catalog is composed at open time from two sources:

| Source | Lifetime | Examples |
| --- | --- | --- |
| **Static registry** (`commands/registry.ts`) | App lifetime | Go to Overview, Create fragment…, Switch project…, Export sequence… |
| **`useCommand` hook** | View mount lifetime | Fragment editor: Save, Next fragment, Toggle vim mode. Overview: Toggle density, Switch sequence… |

Rules for where a command lives:

- A command whose handler can be written without live React state goes in the static registry.
- A command whose handler closes over view-local state (current fragment ID, current draft buffer, current sequence position, …) goes in `useCommand` in that view.

### `useCommand` semantics

- Writes the command definition into a provider-held `Map<id, CommandDef>` (stored in a ref) on every render. The latest closure is therefore always invoked when the palette runs the command. No dependency array.
- Removes the entry on unmount.
- A command not in the map cannot be invoked. Route transitions naturally clean up view-scoped commands when the previous view unmounts.
- Dev-mode warning if two mounted components register the same `id`.

### All actions go through the command system

- Every non-link UI action in the frontend dispatches through `commands.run('command-id')` (or the equivalent hook). Inline `useMutation().mutate(...)` calls from button `onClick` handlers are migrated to commands as part of this feature's first slice.
- Links remain `<Link>` elements with real `href` attributes so right-click / middle-click / Cmd-click work as expected. Navigation commands ("Go to Overview") call `router.navigate()` in parallel for keyboard users.

### Parameterized commands

- A command with an `arg` field opens a second picker step instead of running immediately. Label convention: trailing ellipsis ("Add aspect…").
- The argument picker reuses the `Picker` primitive. It receives `items`, `getKey`, `getLabel`, `renderItem`, and a `placeholder`.
- Item data flows in from React Query via the component that registers the command. The command system does not own data loading.
- A parameterized command with zero items is shown **disabled with an explanation** (e.g. "Add aspect… — no aspects defined"), ordered last in its group.
- Loading items: the argument picker renders skeleton rows. Failure: palette closes and a toast surfaces the error. (No retry affordance in v1.)
- Single argument only. Multi-step argument flows are out of scope; a command needing two picks can issue a follow-up command from inside its `run`.

### Palette UI

- Single-line rows: scope chip (left, for view-scoped only), label (center), hotkey (right, dimmed).
- Sections in this order:
  1. **View-scoped section** — heading is the scope name ("Fragment editor", "Overview", …). Shown only when the active view registered any commands.
  2. **Global sections by category** — `Navigation`, `Create`, `Project`, `Other`. Categories are a TypeScript literal union on the command definition; the compiler enforces correctness.
- Within a section: alphabetical by label.
- Filtering uses cmdk's built-in subsequence scoring. No custom ranking in v1.
- Empty query state: full grouped list. No "view-scoped" header is rendered when no view-scoped commands exist (e.g. on `/`, the project management page).
- No matches: a single "No commands found" line.

### Hotkey binding

- A command definition may declare a `hotkey: string` (e.g. `"⌘S"`, `"j"`).
- The command system binds the hotkey for as long as the command is mounted (static commands are always mounted; `useCommand` commands are bound while their component is mounted).
- Hotkeys are shown right-aligned in the palette row, dimmed.
- The existing chord-based navigation (`g+f`, `g+o`, `g+c`, via `useKeyboardNav.ts`) is **legacy** and will be replaced by command-system bindings in a follow-up slice. New nav hotkeys will be either modifier-prefixed (`Cmd+1`, `Cmd+2`, …) or unmodified single letters that skip text inputs (TBD).

---

## Constraints

- Built on `cmdk` (already in `packages/frontend/package.json`). No new palette library.
- The palette is a `cmdk` consumer of the shared `Picker` primitive, not a black box around the whole cmdk component. The same primitive powers parameterized argument picking and the future entity quick-open.
- Focus trap, ARIA roles, and arrow-key navigation inside the palette are inherited from cmdk + Radix Dialog. No custom a11y wiring.
- Command IDs use the convention `<scope>.<verb>-<noun>` (e.g. `fragment-editor.next-fragment`, `overview.toggle-density`, `project.export-sequence`). Stable across renames.
- Command categories are a closed TypeScript literal union (`'navigation' | 'create' | 'project' | 'other'`). A new command without a category does not compile.
- Editor extensions must yield the palette trigger keys (Tiptap via configuration, CodeMirror via `Prec.highest` keymap or a top-level listener).
- The architecture must allow user rebinding to be added later without a rewrite: hotkeys are declared on command definitions, read by a single binder, and could be overridden by a future user-settings layer.

---

## Prior decisions

- **Split surfaces, Obsidian-style.** Command palette is actions only. Entity selection (fragments, notes, references, aspects, projects) goes through a sibling "quick-open" spec at `Cmd/Ctrl+O`. Rationale: Maskor projects can hold many fragments; mixing entities into the command list would bury low-frequency commands.
- **Every UI action is a command.** Buttons, hotkeys, and the palette all dispatch through `commands.run(id)`. Rationale: single source of truth, makes future logging/undo possible, prevents drift between affordances.
- **Links remain links.** Browser semantics (right-click, middle-click, new tab) matter. Nav commands and `<Link>` elements coexist by both calling `router.navigate()` under the hood.
- **Hybrid registry.** Globals are static; view-scoped commands use a `useCommand` hook. Rationale: globals need a stable enumerable catalog; view-scoped commands need locality and closure over view state.
- **Strict migration.** Existing inline `useMutation` handlers are refactored to commands before the frontend grows further. Rationale: greenfield project, frontend is still small, and avoiding migration cost is cheaper now than later.
- **Two-step picker for parameterized commands.** A shared `Picker` primitive backs the command list, the argument step, and the future entity quick-open. Rationale: one mental model, one component, consistent visuals.
- **Disabled-with-explanation for zero-item parameterized commands.** Rationale: discoverability — users find out the command exists and why it's blocked, rather than wondering why it's missing.
- **No recent/frequent boost.** Palette ordering is deterministic. Rationale: small catalog, deterministic UI matches Maskor's broader design philosophy, cheap to add later if missed.
- **cmdk is the library.** Already installed, shadcn-aligned, primitives-based, active maintenance, plays well with React Query data inside `Command.List`. Rationale: zero additional dependency, lowest-friction fit for the codebase's existing component vocabulary.
- **No user rebinding in v1**, but the architecture is rebinding-ready: hotkeys are declared on commands, bound by a single layer, overridable later.
- **No chord nav going forward.** `useKeyboardNav.ts` is legacy and will be removed in favor of command-bound hotkeys.

---

## Open questions

- [ ] 2026-05-19 — Final scheme for global navigation hotkeys after chord deprecation: modifier-prefixed (`Cmd+1`..`Cmd+N`) versus unmodified single letters that skip text inputs. Depends on a small follow-up decision; not blocking the palette itself.
- [ ] 2026-05-19 — Exhaustive enumeration of global commands at launch. The static registry needs a first-pass list; current candidates: Go to {Overview, Fragment list, Drafts, Preview, Project config, Stats, History, Project management}, Create {fragment, note, reference, aspect}, Export sequence, Switch project…, Switch sequence…
- [ ] 2026-05-19 — Should the palette work on the `/` project management screen (no active project)? Globals like "Create project…" and "Switch project…" make sense there; resolving this changes whether the palette mount is shell-wide or project-shell-only.
- [ ] 2026-05-19 — Public shape of the command-invocation API: a `useCommands()` hook returning `{ run, isAvailable }`, a direct `commands.run(id)` import, or both. Affects how buttons migrate.
- [ ] 2026-05-19 — Whether `disabledReason` should also surface as a tooltip on the corresponding UI button (not just the palette row). Out of strict scope but cheap to wire if the command system is the source of truth.

---

## Acceptance criteria

- Pressing `Cmd/Ctrl+K` opens the command palette regardless of current focus, including inside the Tiptap prose editor and the CodeMirror raw editor.
- Pressing `Cmd/Ctrl+Shift+P` also opens the palette in browsers that do not claim that binding.
- `Esc` closes the palette and restores focus to the previously focused element.
- Typing filters the visible commands using subsequence scoring; "No commands found" appears when nothing matches.
- View-scoped commands appear in the palette only while their owning view is mounted, grouped under a heading that names the scope, above all global commands.
- Global commands are grouped by category (`Navigation`, `Create`, `Project`, `Other`), alphabetical within each group.
- Each command row shows its hotkey on the right when one is declared.
- Selecting a fully-bound command runs its handler and closes the palette.
- Selecting a parameterized command opens an argument picker as a second step; selecting an item runs the handler with that item and closes the palette.
- `Esc` from the argument picker returns to the command list with the previously typed query restored.
- A parameterized command with zero candidate items is shown disabled with a one-line explanation and ordered last in its group.
- A command registered via `useCommand` always invokes the latest closure: changing view state between palette open and command execution uses the current value, not a stale one.
- A command registered via `useCommand` is no longer invokable after its component unmounts.
- Two mounted components registering the same command ID produce a dev-mode warning.
- The same `Picker` primitive renders the command list and the argument picker.
- All non-link UI actions in the frontend dispatch through the command system; no `onClick` handler in a button calls a mutation hook directly.
- `<Link>` elements remain functional for right-click / middle-click / Cmd-click, and the corresponding navigation commands route through `router.navigate()`.
- Editor extensions (Tiptap, CodeMirror) do not consume `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+P`, or `Cmd/Ctrl+O`.
- A hotkey declared on a command is bound while the command is mounted and unbound otherwise.
