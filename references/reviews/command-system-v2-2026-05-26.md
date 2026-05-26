# Review: Command system v2

**Date**: 2026-05-26
**Scope**: `packages/frontend/src/lib/commands/**`, `command-palette/CommandPalette.tsx`, scope-publishing components
**Plan**: `references/plans/command-system-v2.md`
**Spec**: `specifications/command-palette.md`

---

## Overall

The refactor lands the intended shape: typed `defineScope` / `defineGlobalCommand` / `defineScopeCommand`, a barrel-driven catalog, mount-order innermost-first ordering, and components publishing primitive ctx while composition lives in command files. Tests cover the foundation (lifecycle, ctx freshness, hotkey conflict, smoke tests per scope) and the palette. Several Phase-5 cleanups didn't happen, the dispatcher's "view" abstraction keeps the v1 `CommandDef` shape alive past its eulogy, and one structural pattern (publishing during render) is fragile under React 19 StrictMode — which the app actually uses. The biggest concrete defect is #1 below.

---

## Bugs

### 1. `useCommandScope` publishes during render — scope drops out for a window under StrictMode

`packages/frontend/src/lib/commands/useCommandScope.ts:30-46`. The hook calls `publishScope(...)` directly during render (guarded by a ref), and only unpublishes via `useEffect` cleanup. The comment claims "In StrictMode dev double-mounting, cleanup runs between the two renders so the second render publishes cleanly" — but React 19 StrictMode doesn't re-render between the simulated unmount/remount of effects. The actual sequence on initial mount is:

```
render (publish via ref guard)
render again (ref already set, skip)
commit
useEffect setup (no-op)
simulated unmount → cleanup runs → unpublish + unpublishRef = null
simulated remount → useEffect setup runs (no-op)
```

After mount completes, `unpublishRef.current` is null and the scope is not in the active map. The next render of any ancestor (or a state change in the publisher itself) re-publishes via the ref guard, but until then the scope is effectively dead. Hotkeys fired, palette opens, or `commands.run` calls in that window won't see the scope's commands. Likely invisible most of the time because publishers re-render quickly, but it's a real visibility gap and the rationale comment is wrong.

Fix: publish in `useEffect` (or `useLayoutEffect` if pre-paint visibility matters), not during render. The mount-order counter assigned in `useEffect` still orders parent-before-child correctly because effect setups run bottom-up — actually that flips the order, so you'd track order via a render-time `useRef` snapshot and assign in the effect. Worth a careful design pass.

### 2. Palette getters crash if the scope unmounts while the palette is open

`packages/frontend/src/lib/commands/CommandsProvider.tsx:67-94`. `makeLegacyViewForScope`'s `disabledReason` and `arg.items` both call `getCtx()` and pass the result straight into `def.disabled(ctx)` / `argSource.items(ctx)` without a guard. If the scope unmounts while its commands are still in the palette's `viewScopedSections` snapshot, `getCtx()` returns `undefined` and the scope's `(ctx) => ctx.field` predicates throw.

Repro shape: open palette while on Overview, scope unmounts (e.g. navigation completes its async cleanup), palette re-renders, `getEffectiveDisabledReason` walks every scope command and one throws.

Fix: guard `getCtx()` returning undefined — either short-circuit `disabled` to a "Scope unavailable" string and `items` to `[]`, or drop the command from the merged map at unpublish time (already done) AND avoid keeping a stale snapshot in the palette (`CommandPalette.tsx:184-223` freezes sections per opening).

---

## Design

### 3. Downstream consumers key scopes by `label`, not `id`

`CommandsProvider.tsx:73` (`scope: def.scopeLabel`), `HotkeyBinder.tsx:80-85`, `CommandPalette.tsx:190-198`. The provider tracks active scopes by id internally, but the legacy `CommandDef` "view" exposes `scope: scopeLabel`, and the palette and binder index by that string. Two scopes with the same label silently collapse — palette groups them under one heading, binder's mount-order lookup picks whichever was last written. Currently no two scopes share a label, but the constraint isn't enforced anywhere (no dev warning, no type). Move the public key to scope id and keep label as display-only.

### 4. The "adapter shim" and v1 `CommandDef` weren't fully retired in Phase 5

`packages/frontend/src/lib/commands/types.ts:97-114`. The v1 `CommandDef<T>` interface and `CommandScope` type are still defined, with a comment that says "Removed in Phase 5." They aren't — they're the lingua franca between provider/palette/binder via the "legacy view" helpers. Either delete them and have the palette/binder consume `AnyCommandDef` directly (extra polymorphism but honest), or rename the type to something like `MergedCommandView` and drop the "v1 compatibility" framing. The current state is the worst of both: the comment lies and a future reader is confused about whether to clean it up.

### 5. `useCommands.ts` still uses the permissive id type

`packages/frontend/src/lib/commands/useCommands.ts:8-11`. `type AnyId = CommandId | (string & {})`. The comment says "Phase 5 tightens this to `CommandId` only." Phase 5 is done. Today, `commands.run("oops:typo")` compiles silently because of the `string & {}` fallback. Tighten to `CommandId`.

### 6. `useCommands()` re-allocates its result every render

`useCommands.ts:19-34`. No `useMemo` around the returned `{ run, isAvailable, list }`. Consumers that put `commands` (or `commands.run`) in a `useEffect`/`useCallback` dependency array will re-fire each render. Wrap in `useMemo` keyed on `getMap`/`run` from the underlying context (those are stable via `useCallback`).

---

## Minor

### 7. `editorScope` is a singleton with multiple realistic publishers

`scopes/editor.ts` + `entity-editor-shell.tsx:353`. Every entity editor (Fragment, Note, Reference, Aspect) mounts `EntityEditorShell` which publishes `editorScope`. Today only one is mounted at a time, but as soon as anyone builds a split-pane or comparison view the dev-warning fires and the inner view wins arbitrarily. Worth a note in the scope file or a non-singleton variant for editor-like scopes.

### 9. `attach` category is dead for global section rendering

`CommandPalette.tsx:116-123`. `CATEGORY_LABELS` includes `attach: "Attach"` but `CATEGORY_ORDER` doesn't. Currently only `fragment-metadata` scope commands use this category, and they render under their scope's section anyway — so the label is never read. Either remove `attach` from `CATEGORY_LABELS` or remove it from the `CommandCategory` union.

### 11. Stale `argGenerationRef` bump on mount

`CommandPalette.tsx:158-168`. The close-effect runs on first mount with `open=false`, bumping the generation counter unnecessarily. Harmless but a one-line guard (`if (!hasMountedRef.current) return;`) would tidy it.

### 12. Catalog-level registry tests were deleted with no replacement

`registry.test.ts` removal. The new module-level catalog (`catalog.ts`) is exercised indirectly through provider/palette tests, but nothing pins the type-level invariants (e.g., literal-id preservation, `ArgFor<Id>` narrowing) the way the plan's Phase 1 testing notes implied. A small `expect-type`/`tsd`-style file would lock in the inference contract the rest of the codebase now depends on.

---

## Non-issues

- **`RunArgs<A>` collapsing to `[]` for void-arg commands** — intentional and exactly why `commands.run("suggestion:next")` works without a trailing `undefined`.
- **Phantom `_ctxBrand` symbol on `Scope<Ctx>`** — type-level only, no runtime presence. Note that contravariance forced the `useCommandScope` signature change from `S extends Scope<unknown>` to `Scope<Ctx>` — the inline comment explains this clearly.
- **Two overloads on `defineGlobalCommand`/`defineScopeCommand` plus an `any` impl** — necessary because the with-arg branch must drive `A` inference from `arg.items` and the no-arg branch must accept `arg?: undefined`. The `any` impl signature is the standard TS-overload escape hatch.
- **Scope command `arg.items` taking `ctx`** — diverges from globals (parameterless thunk) but lets commands derive items from published state without smuggling ctx through closures. Worth keeping.
- **Discard button dispatching `commands.run(isDiscarded ? "fragment:restore" : "fragment:discard")`** — both ids are typed scope commands; runtime path goes through the v2 disabled gate. Clean.
