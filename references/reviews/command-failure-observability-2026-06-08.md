# Review: Command failure observability — `onFailure` / `onCommandError` sweep

**Date**: 2026-06-08
**Scope**: `packages/frontend/src/lib/commands/`, `packages/frontend/src/components/`, `packages/frontend/src/pages/`
**Plan**: `references/plans/command-failure-observability.md`
**Spec**: `specifications/command-palette.md`

---

## Overall

The backend half of this feature (correlation IDs, `executeCommand` failure capture, `command:error` schema + endpoint, history-page rendering) is correct and well-tested — see the first-pass review notes; nothing below disputes it.

**The frontend half does not work as intended.** The feature's stated goal is *"every failure of a command-system dispatch is surfaced via a toast and recorded as a `command:error` entry."* The mechanism for that is the `onFailure` field, which `CommandsProvider.run` only invokes when a command's `run` **rejects** (returns a rejecting promise) or **throws synchronously**. But the command system's contract is *"components publish synchronous, `void`-returning primitives"* — and every mutation-backed command delegates to such a primitive. The primitives open dialogs, mutate form state, or fire `.mutate()` fire-and-forget; the rejection never reaches the command layer. **Result: not one mutation-backed `onFailure` declared in Phase 5 can fire.** For commands whose underlying mutation also has no `onError`, the failure is now *silently dropped* — the opposite of the feature's goal.

This is a wiring/contract gap, not a typo. Adding `onCommandError` (the requested sweep) cannot fix it either: that filter also only runs inside `CommandsProvider.run`'s catch path, which never executes for the same reason. **Both axes of the sweep require a prior structural change: mutation-backed primitives must return their promise so the command `run` can reject.**

---

## Bugs

### 1. `onFailure` never fires for any mutation-backed command (root cause)

`CommandsProvider.tsx` (`run`, ~L245–257) attaches failure handling only when `def.run(arg)` returns a rejecting `Promise` or throws synchronously:

```ts
let outcome: void | Promise<void>;
try { outcome = def.run(arg); }
catch (error) { onError(error); return; }
if (outcome instanceof Promise) { void outcome.catch(onError); }
```

Every mutation-backed `run` delegates to a context primitive typed `() => void`, and the implementations return `void` at runtime:

- `overview:designate-main` → `designateMain: () => { designateMain.mutate(...) }` (`OverviewPage/index.tsx:479`). `.mutate` is fire-and-forget → returns `undefined` → `outcome` is not a Promise → no catch.
- `overview:create-sequence` / `delete` / `clone` / `insert` / `toggle` → `SequenceSidebar.tsx:279` all call `.mutate(...)`.
- `overview:add-section` / `delete-section` → `useSectionManager.ts` `.mutate`.
- `fragment:discard` / `fragment:restore` → `fragment-editor.tsx:223` `.mutate`.
- `project-management:save-settings` → `SettingsSection.tsx:39` `.mutate`.
- `fragment-metadata:attach-*` / `detach-*` → `fragment-metadata-form.tsx:253` only call `field.onChange(...)` (no mutation at all; persistence is the exempt live-save path).
- `fragment-import:import` → `import: () => void handleImport()` (`FragmentImportPage.tsx:190`). The `void` operator explicitly discards the promise.
- `editor:save` → `save: handleContentSave`, which is `async` but **swallows** its own error (`entity-editor-shell.tsx:320`, *"swallows errors so the parent keeps isDirty=true"*). The returned promise resolves → `.catch` never runs.
- `editor.extract-to-*` / `append-*` / `prepend-*` → `extractTo`/`insertTo` only set dialog state (`entity-editor-shell.tsx:389,420`). The mutation lives in the dialog/confirm handler, which also try/catches internally.
- `suggestion:next` → `await ctx.loadNext()`, but `loadNext` catches everything and calls `setSaveError` (`SuggestionModePage/index.tsx:37`). The promise resolves → `.catch` never runs.

```
command.run() → ctx.primitive()  →  .mutate() / setState() / void handleX()  →  returns undefined
                                  →  outcome is not a Promise  →  onFailure skipped
```

Fix: see Design item 4. No change to `onFailure` strings is meaningful until the primitives propagate rejection.

### 2. Several command failures are now silently dropped

A subset of item 1's commands back onto mutations that have **only** `onSuccess` (no `onError`), and there is **no** global `MutationCache`/`QueryCache.onError` (`queryClient.ts` configures only `queries.staleTime`/`retry`). For these, a failed mutation surfaces nothing — no toast, no in-place UI, no `command:error` entry:

- `overview:designate-main` (`OverviewPage/index.tsx:257` — `onSuccess` only)
- `overview:add-section`, `overview:delete-section` (`useSectionManager.ts:32,53` — `onSuccess` only)
- `overview:create-sequence`, `delete-sequence`, `toggle-sequence-active`, `clone-sequence`, `insert-sequence` (`SequenceSidebar.tsx:131–165` — `onSuccess` only)
- `project-management:save-settings` (`SettingsSection.tsx:18,39` — `onSuccess` only)
- `fragment:discard`, `fragment:restore` (`fragment-editor.tsx:223,237` — `onSuccess` only)

Before this branch these were equally silent, so it is not a *regression* — but the branch's whole purpose was to fix exactly this, and it doesn't. The `onFailure` declarations give the *appearance* of coverage while delivering none.

### 3. Tests assert the mechanism, never the wiring

`CommandsProvider.onFailure.test.tsx` exercises **synthetic** commands whose `run` throws directly (`run: () => { throw control.error; }`). That proves `CommandsProvider.run` works in isolation, but no test renders a real scope (e.g. `overviewScope`) and asserts that dispatching a real command on a failing mutation produces a toast or a `command:error` POST. That blind spot is why bugs 1–2 passed `verify`. A single integration-style test — publish a scope whose primitive returns a rejecting `mutateAsync`, dispatch, assert toast — would have caught it.

---

## Design

### 4. The fix: mutation-backed primitives must return their promise

For `onFailure`/`onCommandError` to fire, the published context primitive must hand its rejection to the command layer. Two shapes, applied per command:

**Axis A — default toast + `command:error` (commands with no in-place error UI).** Change the primitive from fire-and-forget to promise-returning and let the rejection bubble:

```ts
// scope context interface
designateMain: () => Promise<void>;            // was () => void

// component
designateMain: () => designateMain.mutateAsync({ projectId, sequenceId: sequence.uuid }),
// keep cache invalidation in the mutation's onSuccess; drop nothing else
```

`run: (ctx) => ctx.designateMain()` already returns whatever the primitive returns, so `outcome` becomes a rejecting Promise and the existing `onFailure: "Failed to designate main sequence."` finally fires. Apply to: `designate-main`, `add-section`, `delete-section`, all five `sequence-sidebar` commands, `save-settings`, `discard`, `restore`. These are the **silent** set from bug 2 — highest priority.

**Axis B — in-place display via `onCommandError` (commands that already render their own error).** These currently handle the error one layer below the command system (mutation `onError` or internal `setState`). To route them through the command system honestly: make the primitive reject, remove the lower-level handler, and claim the failure with the scope filter:

```ts
useCommandScope(projectConfigScope, ctx, {
  onCommandError: (commandId, error) => {
    setIndexStatus({ message: messageFor(commandId, error), isError: true });
    return true; // suppress the default toast; component shows it in place
  },
});
```

Candidates and their existing in-place UI:
- `config:rebuild-index`, `config:reset-database` → in-place status line (`GeneralTab.tsx:49–80` `onError`). Today this bypasses the command system entirely; `onFailure` is dead weight. Either adopt `onCommandError` or drop `onFailure`.
- `suggestion:next` (save half) → `setSaveError` (`SuggestionModePage` / `suggestion-mode.ts:33`). Note the plan's premise that *"loadNext is currently unhandled"* is wrong — `loadNext` catches internally too, so the `onFailure` on `suggestion:next` is fully dead.
- `editor:save` → swallowed to keep `isDirty` (`entity-editor-shell.tsx:320`). Decide: surface via `onCommandError`, or keep swallowing and drop the `onFailure`.

**Axis C — leave as dialog-owned, remove the `onFailure` (commands that only open a modal).** `editor.extract-to-*`, `editor.append-/prepend-to-*`, and `fragment-import:import` dispatch into a dialog/confirm flow that owns its own errors (same exemption the plan already grants `create:*`). Their `onFailure` strings are unreachable and should be deleted to stop implying coverage. The `fragment-metadata:*` commands likewise only mutate form state (live-save path is exempt and already shows in-place rollback) — drop their `onFailure`.

### 5. The reorder/move/merge commands have rollback but no message

`overview:group-selection`, `split-before/after-selection`, `move-selection-to-section`, `merge-section-up/down` go through `useSequenceMutations`, whose `onError` handlers (`useSequenceMutations.ts:50–253`) perform optimistic-rollback but take `_error` unused — no toast, no message. So a failure silently reverts the UI with no explanation. If these adopt Axis A, keep the rollback in `onError` and re-throw so the command layer can also toast/log; otherwise at minimum surface a message.

---

## Minor

### 6. `onCommandError` filter is unused infrastructure (restated)

As noted in the first-pass review, no component passes `onCommandError` today. Design item 4/Axis B is the intended first consumer. Until then it remains dead but documented.

### 7. `crypto.randomUUID()` in the error path has no fallback

`CommandsProvider.handleFailure` calls `crypto.randomUUID()` for the fallback POST. In a non-secure context it throws *inside* the failure handler, masking the original error. The backend guards with `?? randomUUID()`; the frontend doesn't. Low risk given localhost dev, but wrap the POST block defensively.

---

## Non-issues

- **Backend `onError` clone of the `HTTPException` response** (`app.ts`) — correct; the `new Response(body, response)` pattern preserves status + headers and the body stream is passed, not consumed. Verified by the HTTPException-path test.
- **`customFetch` reading the correlation id from the header, not the body** — correct and intentional; `throwStorageError` builds its own response with no body-level id.
- **`command:error` payload `commandId` typed `z.string()` rather than the `CommandLabel` union** — intentional; it also holds frontend command ids, a different namespace (ADR 0012).
- **Synchronous-then-`.catch` dispatch in `run`** — correct; preserves synchronous-invocation timing for palette/hotkey/tests while still catching rejections. (Its limitation is bug 1, which is about the *callees*, not this code.)

---

## Suggested edit summary (per command)

| Command(s) | Today | Recommended axis |
|---|---|---|
| `overview:designate-main`, `add-section`, `delete-section` | silent | **A** — return `mutateAsync` |
| `overview:create/delete/toggle/clone/insert-sequence` | silent | **A** |
| `project-management:save-settings` | silent | **A** |
| `fragment:discard`, `fragment:restore` | silent | **A** |
| `overview:group/split/move/merge` | rollback, no message | **A** (re-throw after rollback) |
| `config:rebuild-index`, `config:reset-database` | in-place `onError` | **B** or drop `onFailure` |
| `suggestion:next` | in-place `setSaveError` | **B** (and correct the plan note) |
| `editor:save` | swallowed → dirty | **B** or drop `onFailure` |
| `editor.extract/append/prepend-*` | dialog-owned | **C** — drop `onFailure` |
| `fragment-import:import` | dialog/`void`-discarded | **C** — drop `onFailure` |
| `fragment-metadata:attach/detach-*` | form-state only (live-save exempt) | **C** — drop `onFailure` |

Not implemented — documented per request. Recommend tackling the **A** (silent) rows first; they are the only ones where users currently get *no* feedback at all.

---

## Fix specification

Everything required to make the feature actually deliver its goal. No backend changes — the schema, `executeCommand` capture, the `/action-log/errors` endpoint, and `CommandsProvider.run`'s catch logic are all correct; the only defect is that the published primitives never reject. The fix is to propagate rejection from the primitives, then route each command to the right surface.

### Principle

A mutation-backed scope-context primitive must **return a promise that rejects on failure**. Concretely: replace `.mutate(...)` (fire-and-forget) with `return …mutateAsync(...)`, and type the field `() => Promise<void>` instead of `() => void`. The command `run` already evaluates `ctx.fn()` as its return value, so the rejection reaches `CommandsProvider.run` → `onFailure`. Typing the field as `Promise<void>` is the safety net: any future primitive that forgets to return its promise becomes a compile error at the publishing component.

> TanStack note: `mutateAsync` still runs the mutation's `onSuccess`/`onError` callbacks **and** rejects. Existing optimistic-rollback `onError` handlers (`useSequenceMutations.ts`) stay as-is; the rejection propagates past them. So switching the call site is sufficient — no rollback logic changes.

### Axis A — propagate to default toast + `command:error` (the 11 silent commands)

These have no in-place UI and no `onError`. Make them reject; the existing `onFailure` strings then fire and log.

**A1. `overview:designate-main`, `add-section`, `delete-section` — `OverviewPage/index.tsx:479`**

```ts
// before
designateMain: () => {
  if (sequence) designateMain.mutate({ projectId, sequenceId: sequence.uuid });
},
createSection: () => {
  if (sequence) sectionManager.createSection.mutate({ projectId, sequenceId: sequence.uuid, data: { name: "" } });
},
deleteSection: () => {
  if (sequence && sectionManager.confirmingDeleteSectionId)
    sectionManager.deleteSection.mutate({ projectId, sequenceId: sequence.uuid, sectionId: sectionManager.confirmingDeleteSectionId });
},

// after
designateMain: () =>
  sequence ? designateMain.mutateAsync({ projectId, sequenceId: sequence.uuid }).then(() => {}) : Promise.resolve(),
createSection: () =>
  sequence ? sectionManager.createSection.mutateAsync({ projectId, sequenceId: sequence.uuid, data: { name: "" } }).then(() => {}) : Promise.resolve(),
deleteSection: () =>
  sequence && sectionManager.confirmingDeleteSectionId
    ? sectionManager.deleteSection.mutateAsync({ projectId, sequenceId: sequence.uuid, sectionId: sectionManager.confirmingDeleteSectionId }).then(() => {})
    : Promise.resolve(),
```

`.then(() => {})` narrows `Promise<TData>` to `Promise<void>` to match the interface. Hook-level `onSuccess` (`OverviewPage/index.tsx:257`, `useSectionManager.ts:32,53`) is preserved automatically.

**A2. `overview:group/split-before/split-after/move/merge-up/merge-down` — `OverviewPage/index.tsx:385–475`**

Each handler is a `useCallback` ending in `sequenceMutations.<op>.mutate({...})`. Make it `async`, keep the guard early-returns, and `await` the async variant:

```ts
// before
const groupSelection = useCallback(() => {
  if (!sequence || placedSelection.length < 1) return;
  sequenceMutations.groupFragments.mutate({ projectId, sequenceId: sequence.uuid, data: { fragmentUuids: placedSelection, name: "" } });
}, [sequence, placedSelection, projectId, sequenceMutations]);

// after
const groupSelection = useCallback(async () => {
  if (!sequence || placedSelection.length < 1) return;
  await sequenceMutations.groupFragments.mutateAsync({ projectId, sequenceId: sequence.uuid, data: { fragmentUuids: placedSelection, name: "" } });
}, [sequence, placedSelection, projectId, sequenceMutations]);
```

Apply identically to `splitBefore`, `splitAfter`, `moveSelectionToSection`, `mergeSectionUp`, `mergeSectionDown`. (`useSequenceMutations` must expose `mutateAsync`; the wrappers already wrap `useMutation`, so it's available — destructure or reference `.mutateAsync`.)

**A3. `overview:create/delete/toggle/clone/insert-sequence` — `SequenceSidebar.tsx:197–292`**

Each handler calls `<op>.mutate(input, { onSuccess })`. Switch to `return <op>.mutateAsync(input, { onSuccess })` and make the handler/primitive return that promise. Inline `onSuccess` is retained by `mutateAsync`. Example:

```ts
// before
const handleCreate = () => { createSequence.mutate({ projectId, data: { name } }, { onSuccess: (r) => {/* … */} }); };
// after
const handleCreate = () => createSequence.mutateAsync({ projectId, data: { name } }, { onSuccess: (r) => {/* … */} }).then(() => {});
```

Note `handleSetActive` (`SequenceSidebar.tsx:234`) currently `updateSequence.mutate(...)` with no options — `return updateSequence.mutateAsync(...).then(() => {})`.

**A4. `project-management:save-settings` — `SettingsSection.tsx:39`**

```ts
// before:  patchMutation.mutate(input, { onSuccess: … });
// after:   return patchMutation.mutateAsync(input, { onSuccess: … }).then(() => {});
```

**A5. `fragment:discard`, `fragment:restore` — `fragment-editor.tsx:84–86, 223–247`**

```ts
// before
const { mutate: discardFragment } = useDiscardFragment();
const { mutate: restoreFragment } = useRestoreFragment();
const handleDiscard = useCallback(() => { discardFragment({ projectId, fragmentId }, { onSuccess: … }); }, [...]);

// after
const { mutateAsync: discardFragment } = useDiscardFragment();
const { mutateAsync: restoreFragment } = useRestoreFragment();
const handleDiscard = useCallback(
  () => discardFragment({ projectId, fragmentId }, { onSuccess: () => { invalidateFragment(); invalidateActionLog(); onDiscarded?.(); } }).then(() => {}),
  [...],
);
```

**A6. Interface type changes (compile-time guard).** Change these context fields from `() => void` to `() => Promise<void>` (arg variants keep their parameter):

- `OverviewContext` (`scopes/overview.ts:10`): `designateMain`, `createSection`, `deleteSection`, `groupSelection`, `splitBefore`, `splitAfter`, `moveSelectionToSection: (uuid) => Promise<void>`, `mergeSectionUp/Down: (uuid) => Promise<void>`.
- `SequenceSidebarContext` (`scopes/sequence-sidebar.ts:4`): `createSequence`, `deleteSequence`, `setSequenceActive: (id, active) => Promise<void>`, `cloneSequence: (id) => Promise<void>`, `insertSequence: (id) => Promise<void>`.
- `ProjectManagementContext` (`scopes/project-management.ts:3`): `saveSettings`.
- `FragmentEditorContext` (`scopes/fragment-editor.ts`): `discard`, `restore`.

The command `run` bodies (`run: (ctx) => ctx.designateMain()` etc.) need no change — they already return `ctx.fn()`.

### Axis B — route in-place handlers through the command system

These already render their own error one layer below the command system. Two valid choices per command — **pick one and make it explicit**:

- **B-keep**: leave the in-place handling where it is and **delete the dead `onFailure`** (it can never fire). Simplest. Downside: the failure is never written as a `command:error` action-log entry.
- **B-route**: make the primitive reject (Axis A shape), remove the lower-level error handler, and claim the failure with an `onCommandError` filter so the component renders it in-place. A claimed failure suppresses *both* the toast and the fallback log POST — but for these three commands (all backend mutations) the real failures are already logged server-side by `executeCommand`, so the only thing suppression keeps out of the log is frontend-only presentation noise. This coupling is an accepted, documented decision — see ADR 0012 §4 ("Frontend failure presentation").

`onCommandError` wiring (B-route), e.g. config:

```ts
// GeneralTab.tsx — primitive rejects, drop the per-call onError
rebuildIndex: () => rebuildIndex.mutateAsync(input, { onSuccess: () => setIndexStatus({ message: "Index rebuilt.", isError: false }) }).then(() => {}),

useCommandScope(projectConfigScope, ctx, {
  onCommandError: (commandId, error) => {
    const message = error instanceof Error ? error.message : "Failed.";
    if (commandId === "config:rebuild-index") setIndexStatus({ message, isError: true });
    else if (commandId === "config:reset-database") setResetStatus({ message, isError: true });
    return true; // claim it: suppress default toast + log POST
  },
});
```

Targets:
- `config:rebuild-index`, `config:reset-database` (`GeneralTab.tsx:49–87`) — in-place status line.
- `suggestion:next` (`SuggestionModePage/index.tsx:37`, `scopes/suggestion-mode.ts`) — `loadNext` currently catches internally and calls `setSaveError`. To B-route: drop the `try/catch` in `loadNext`, let it reject, add `onCommandError` that calls `setSaveError`. **Also correct the plan/spec note** claiming `loadNext` is "currently unhandled" — it is handled.
- `editor:save` (`entity-editor-shell.tsx:320`) — `handleContentSave` swallows to preserve `isDirty`. To B-route: stop swallowing, add `onCommandError` that keeps the dirty indicator and shows the message. To B-keep: delete its `onFailure`.

### Axis C — delete unreachable `onFailure` (dialog-owned or no mutation)

These commands cannot reject: they open a dialog (whose own flow owns errors) or only touch local/form state. Remove the `onFailure` line to stop implying coverage.

- `editor.extract-to-fragment/note/reference/aspect` (`scopes/editor.ts:54,67,80,93`) — open the extract dialog (`entity-editor-shell.tsx:389`).
- `editor.append-/prepend-to-{fragment,note,reference,aspect}` (8 commands, `scopes/editor.ts`) — open the insert dialog (`entity-editor-shell.tsx:420`); confirm handler already try/catches.
- `fragment-import:import` (`scopes/fragment-import.ts:13`) — `import: () => void handleImport()` (`FragmentImportPage.tsx:190`); the import flow shows its own errors.
- `fragment-metadata:attach-aspect/detach-aspect/attach-reference/detach-reference` (`scopes/fragment-metadata.ts`) — only call `field.onChange`; persistence is the exempt live-save path with its own optimistic-rollback in-place error.
- `margin:comment-block` (`scopes/margin.ts:15`) — `commentBlock` only moves focus into the margin slot (no mutation; the comment is persisted later by `editor:save`). Cannot throw.

### Tests required

Per `.claude/CLAUDE.md` ("write tests when changing behavior"):

1. **Integration — Axis A fires.** Render a real scope (e.g. `overviewScope`) via its component or a thin harness, with the mutation hook mocked to **reject**. Dispatch the command through `commands.run(...)`. Assert `toast.error` called and `RecordCommandError` POSTed. This is the test class that was missing (bug 3) — at least one is mandatory.
2. **`CommandsProvider` — async rejection.** Extend `CommandsProvider.onFailure.test.tsx` with a command whose `run` returns a **rejecting promise** (not just a synchronous `throw`), asserting the same toast + POST. The current suite only covers synchronous throws.
3. **Axis B — `onCommandError` claims it.** For one B-route command: mutation rejects → in-place state set, `toast.error` **not** called, `RecordCommandError` **not** called.
4. **Regression guard (optional but recommended).** A unit assertion that every command in the catalog declaring `onFailure` is reachable — e.g. a lint/test that fails if an `onFailure` command's published primitive is typed `() => void`. Cheaper proxy: a doc/CI note. (Hard to fully automate; the `() => Promise<void>` interface change in A6 is the real guard.)

### Execution checklist

1. A6 — flip the interface field types to `() => Promise<void>`. This surfaces every call site that must change as a type error.
2. A1–A5 — fix each publishing component until `bun run typecheck` is clean.
3. Axis B — decide keep-vs-route per command; wire `onCommandError` where routing.
4. Axis C — delete the unreachable `onFailure` lines.
5. Correct the `suggestion:next` premise in `references/plans/command-failure-observability.md` and `specifications/command-palette.md` / `packages/frontend/CLAUDE.md`.
6. Add tests 1–3.
7. `bun run format && bun run verify`.

No `bun run codegen` needed — no route/schema change.

