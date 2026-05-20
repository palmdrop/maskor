# Review: Command Palette

**Date**: 2026-05-20
**Scope**: `packages/frontend/src/{lib/commands,components/command-palette,components/picker,pages,main.tsx}`
**Plan**: `references/plans/command-palette.md`
**Spec**: `specifications/command-palette.md`

---

## Overall

The slice lands the intended behavior: Cmd/Ctrl+K opens a focus-trapped palette from any focus, view-scoped sections render above global categories, parameterized commands work end-to-end with an Esc-restorable two-step flow, and the chord nav is gone. The plumbing is small and the tests cover the load-bearing primitives well. One real bug is worth fixing before this is treated as production-ready: `useCommand` freezes most of the command definition at mount, which is both a spec deviation and breaks the only command in the catalog that actually needs live state in `arg` — `project:switch-sequence` after a project switch.

---

## Bugs

### 1. `useCommand` freezes `arg`, `label`, `hotkey` at mount — breaks `Switch sequence` after project change

`packages/frontend/src/lib/commands/useCommand.ts:6-22` — the spec says (line 67): "Writes the command definition into a provider-held `Map<id, CommandDef>` (stored in a ref) on every render. … No dependency array." The implementation does the opposite — `useEffect` deps are `[def.id, register, unregister]`, so `register(stableDef)` runs only on mount/unmount. `stableDef` is built by spreading `defRef.current` once. Only `run` and `disabledReason` are made live (via wrapper / getter). Everything else — `arg`, `label`, `scope`, `category`, `hotkey` — is whatever the first render produced.

This becomes a real bug in `useProjectShellCommands`:

```
mount on /projects/A → register Switch sequence with arg.items = () => ListSequences("A")
user invokes Switch project → /projects/B
ProjectShellLayout re-renders (same component, new projectId="B") — no remount
useProjectShellCommands("B") runs, defRef.current.arg.items captures B
…but stableDef.arg.items still references the closure that captures "A"
user opens palette, picks Switch sequence → ListSequences("A") → wrong project's sequences
```

The `run` closure for the navigate is fine (wrapped through `defRef`). The bug is specifically `arg.items` and any other `arg.*` callbacks that close over route state.

Fix: either re-register on every render as the spec says, or expose `arg` through a getter on `stableDef` like `disabledReason` already is (and the same for `label`/`hotkey` if they're ever derived from state — they aren't today, but the spec contract is "live def").

### 2. Async arg-loading race on user-driven step changes

`packages/frontend/src/components/command-palette/CommandPalette.tsx:228-241` — `handleSelectCommand` kicks off `await command.arg.items()` and then unconditionally calls `setArgItems(resolvedItems)` and `setArgLoading(false)` in `finally`. If the user presses Esc (handler at line 250-260 returns to the command list) or selects a different async-arg command before the first promise resolves, the resolved items land on the wrong step / wrong command's picker. Most likely visible failure: open async command A, Esc back, open async command B → A's items render briefly inside B's skeleton because `setArgItems` from A's promise wins the race.

Fix: capture the active command at call time and bail before `setArgItems` if `activeArgCommand` no longer matches, or use an AbortController / generation counter.

---

## Design

### 3. `useMemo` deps of `[open]` silently snapshot the catalog

`packages/frontend/src/components/command-palette/CommandPalette.tsx:169-199` — `viewScopedSections`, `globalSections`, and `commandMap` all memoize on `[open]`. That works because the palette closes after every action, so the next open recomputes. But two side effects:

- Commands registered *after* the palette opens never show up. Plausible scenario: user lands on a route, the host's `useEffect` (from a `useCommand`) hasn't flushed yet, user immediately hits Cmd+K. Generally fine because React mount effects flush before user input, but the contract is invisible.
- Sort order (disabled-at-end) is frozen at open. If a command becomes disabled mid-session — e.g. `confirmingDeleteSectionId` flips — the row's reason updates live (good, getter) but the section ordering is stale. Minor in practice; flagging because the snapshot semantics aren't documented in code.

If snapshot-at-open is intentional, leave it but add a one-line comment explaining the contract. Otherwise track the map via `useSyncExternalStore` so the palette is live.

### 4. Spec contract for `useCommand` is documented as "every render" but implemented as "every mount"

`specifications/command-palette.md:67` versus `useCommand.ts:11`. Same root cause as Bug 1, but worth calling out as a design issue independently: future contributors reading the spec will write commands assuming `arg`/`hotkey`/`label` are live, and the breakage will be invisible until a state-derived field is added to one of those slots. Either update the spec to describe the actual narrower contract, or fix the impl to match the spec.

---

## Minor

### 5. Plan checkboxes for Phase 5/6/7 commits are unchecked but the commits exist

`references/plans/command-palette.md:85,97,108` — each `git commit` task is `- [ ]` but `git log` shows the corresponding commits (`e68ec77`, `692a1ff`, `72a958f`). Stale plan; either tick or note that the plan was updated before the final commit landed.

### 6. `formatHotkeyParts` is a `function` declaration in a file otherwise using arrow functions

`packages/frontend/src/components/command-palette/CommandPalette.tsx:29` — coding standards prefer arrow functions unless there's a specific reason.

### 7. `staticRegistry` exported with split declaration/export

`packages/frontend/src/lib/commands/registry.ts:6,38` — `const staticRegistry: CommandDef[] = [...]; export { staticRegistry };` would be a single `export const`. Stylistic.

### 8. Type-erased `arg` callbacks force casts inside catalog hooks

`packages/frontend/src/lib/commands/catalog/useProjectShellCommands.ts:135-141` and `registry.ts:21-31` — `getKey: (item) => (item as Sequence).uuid`. `CommandDef<T = unknown>` is parameterized but `useCommand` always lands at `T = unknown`, so callbacks lose static type checking. Not blocking; consider a `defineCommand<T>()` helper later if more parameterized commands appear.

### 9. Test uses `useCommand` inside a `for...of` loop (rules-of-hooks)

`packages/frontend/src/components/command-palette/__tests__/CommandPalette.test.tsx:14-19` — works because the array length is constant per render, but the `eslint-disable` is a smell. A `<Registrar def={def} />` component per item would avoid it.

### 10. `mapRef` initialization is a side-effect during render

`packages/frontend/src/lib/commands/CommandsProvider.tsx:21-25` — `if (mapRef.current.size === 0) { ... fill from staticRegistry ... }` runs in the render body. Safe in practice (StrictMode double-render is idempotent because the second pass sees `size > 0`), but `useRef(() => initialMap())` (or `useMemo`) is the conventional one-shot pattern.

### 11. `KEY_GLYPHS` doesn't cover `+`, `/`, `\`, etc.

`packages/frontend/src/components/command-palette/CommandPalette.tsx:18-27` — `hotkey.toLowerCase().split("+")` on `"mod++"` would split into `["mod", "", ""]`. Not currently exercised by any registered command but worth noting if `+` is ever a primary key.

---

## Non-issues

- **`CommandPalette` uses a capture-phase listener and bypasses `HotkeyBinder` for `Cmd+K`/`Cmd+Shift+P`.** Intentional and documented — editors check `defaultPrevented`, so capture-phase `preventDefault()` is the simplest way to win over Tiptap/CodeMirror.
- **`HotkeyBinder` uses non-capture-phase listeners.** Means editor hotkeys (e.g. CodeMirror's own `Cmd+Enter`) can still win, but the only command-bound hotkey right now is `mod+enter` on `Suggestion mode → Next fragment`, which matches the previous in-page listener's priority exactly. No regression.
- **`mod` matches metaKey *or* ctrlKey on both platforms** (`HotkeyBinder.tsx:38-44`). Means Ctrl+K also opens the palette on Mac, which is non-standard but harmless and matches the explicit Cmd+K handler in `CommandPalette` for consistency.
- **`commandFilter` returns `score * 0.1` for disabled commands instead of 0.** Disabled rows still match the query but rank below enabled ones in cmdk's own ordering. Combined with the disabled-last sort, this just means the disabled rows surface when the user explicitly searches for them.
- **Static registry only has two commands (`Go to Project management`, `Switch project…`)**, not the 8 navigation entries listed in the plan's Phase 6. Phase 6 explicitly resolved this: project-route nav lives in `useProjectShellCommands` because it needs `projectId`. The spec open question is closed accordingly (`command-palette.md:138`).
- **No toast on command failure.** Phase 5 acknowledges this — there's no toast library in the codebase yet; failures `console.error` and close the palette. Tracked in `SUGGESTIONS.md`.
- **`useCommand` lints duplicate IDs only at register-time, not across the whole tree.** StrictMode's mount-unmount-mount cycle does not trigger the warning because cleanup runs between the two registers. Confirmed by the test at `useCommand.test.tsx:107-122`.
