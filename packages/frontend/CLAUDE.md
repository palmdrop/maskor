Use the generated orval client for every API call. Do not hand-roll `useMutation` / `useQuery` against `customFetch` — that bypasses generated types and route schemas.

Generated hooks live under `src/api/generated/<tag>/<tag>.ts` (one file per OpenAPI tag), e.g. `useCreateProject`, `useUpdateProject`. Schemas live in `src/api/generated/maskorAPI.schemas.ts`.

When you add or change an API route (new endpoint, new field, new mode), regenerate the client. The simplest path is a single command from the repo root:

```
bun run codegen
```

This refreshes the committed snapshot from `packages/api` and then runs orval here — no server needed. To run the two steps individually instead:

1. In `packages/api`, run `bun run generate-openapi` to refresh the committed snapshot (`src/api/openapi.json`). No server needed — the spec is generated in-process from the route definitions.
2. From `packages/frontend`, run `bun run codegen`. It runs orval against the committed snapshot — the API does not need to be running.

Then use the regenerated hook in the frontend, and delete any hand-rolled mutation it replaces.

If a hook you expect isn't generated, the route is either missing from the OpenAPI spec or the snapshot wasn't regenerated after the route change — fix that first (re-run step 1); don't work around it with a custom mutation. `bun run verify` fails if the snapshot drifts from the routes.

Example to mirror: `RenameProjectDialog.tsx` uses `useUpdateProject` from the generated client.

## Command system

Every non-link UI action dispatches through the command system. Button `onClick` handlers must not call `useMutation().mutate(...)` directly. Command logic lives in command files under `src/lib/commands/scopes/` or `src/lib/commands/global/`, not in components — components publish a typed context and dispatch via `commands.run(id)`.

**Where commands live:**

- Truly global (works anywhere, e.g. `Switch project…`, `Go to Project management`): `src/lib/commands/global/<category>.ts` via `defineGlobalCommand({...})`.
- View-contextual (the view's mounted, the commands are available): `src/lib/commands/scopes/<scope>.ts`. Each scope file declares its scope, its typed context interface, and the commands belonging to it.

**Rules:**

- Component primitives in, composed actions out: components publish small single-purpose functions (`loadNext`, `goBack`, `attachAspect`) in their scope's context. Composition (save-then-load-next) lives in the command file's `run`.
- Dialog-internal confirmation buttons (form submits inside an already-open modal), DnD handlers, and keyboard/blur-driven inline mutations are exempt — they are not palette-discoverable.
- A scope is a singleton: only one mounted component can publish a given scope at a time. Dev warns on duplicate publication.
- Active scopes appear in the palette innermost-first (most-recently-mounted on top), then global sections by category.

**Pattern — view-scoped command:**

```ts
// src/lib/commands/scopes/my-view.ts
import { defineScope, defineScopeCommand } from "../define";

export interface MyViewContext {
  isReady: boolean;
  foo: () => void;
}

export const myViewScope = defineScope<MyViewContext>("my-view", { label: "My view" });

const fooCommand = defineScopeCommand(myViewScope, {
  id: "my-view:foo",
  label: "Do Foo",
  category: "other",
  hotkey: "mod+shift+f",
  disabled: (ctx) => (ctx.isReady ? undefined : "Not ready"),
  run: (ctx) => ctx.foo(),
});

export const myViewCommands = [fooCommand] as const;
```

```ts
// MyPage.tsx
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { myViewScope } from "@lib/commands/scopes/my-view";

const commands = useCommands();
useCommandScope(myViewScope, { isReady, foo: handleFoo });
// button: onClick={() => commands.run("my-view:foo")}
```

When adding a new scope or global file, also import its `*Commands` const into `src/lib/commands/scopes/index.ts` (or `global/index.ts`). Missing the barrel import means the command is absent at runtime and missing from the `CommandId` type union.

**Typing:**

`commands.run(id, arg)` is fully typed. The catalog assembles `CommandId` from the literal `id` of every command in the barrel; `ArgFor<Id>` derives the second-arg type per command.

**Parameterized commands — flat-items arg shape (mandatory):**

```ts
// CORRECT — arg is a plain object; items is the function.
defineScopeCommand(myScope, {
  id: "my-view:pick",
  label: "Pick…",
  category: "other",
  arg: {
    items: (ctx) => ctx.eligible, // (ctx) => readonly T[] | Promise<readonly T[]>
    getKey: (item) => item.uuid, // item is inferred — no explicit type
    getLabel: (item) => item.label,
    placeholder: "Pick one…",
  },
  run: (ctx, target) => ctx.attach(target), // target is inferred
});
```

**Do not** use the older `arg: (ctx) => ({ items, getKey, getLabel })` shape — TS won't infer `A` through a callback whose return is itself a generic object literal, and every `(item) => …` collapses to `unknown`. The flat shape (items is the only function, getters are siblings) gives `A` a single inference site and propagates it through to `run`'s second parameter. Globals follow the same shape but `items` is a parameterless thunk (no ctx): `arg: { items: async () => …, getKey, getLabel }`.

Tests that render components using a scope must wrap with `<CommandsProvider>`. To inject a synthetic catalog for a test, `vi.mock("@lib/commands/catalog", () => ({ allCommands: [...] as const }))` before importing the provider.

When narrowing a command from a list, use `Extract<…, { id: Id }>` to pin the specific arg type — otherwise `.run` collapses to the broadest union signature:

```ts
type MyCommand = (typeof myCommands)[number];
const find = <Id extends MyCommand["id"]>(id: Id): Extract<MyCommand, { id: Id }> =>
  myCommands.find((c) => c.id === id) as Extract<MyCommand, { id: Id }>;
```

## Command failure handling

Failures of commands dispatched through `commands.run` are surfaced automatically — you don't write try/catch in components. The contract is the `onFailure` field on a command definition.

**`onFailure` field.** Declare it on any command that can realistically fail (API mutation or async work). Two forms:

```ts
onFailure: "Save failed.",                                   // static friendly message
onFailure: (error) => ({ message: "Import failed.", detail: String(error) }), // derive message + detail
```

When a command with `onFailure` throws (sync or rejected promise), `CommandsProvider.run` resolves the message/detail and shows `toast.error`. If the thrown error is an `ApiRequestError` carrying a `correlationId`, the backend already recorded the failure as a `command:error` action-log entry — the frontend only toasts. Otherwise (network/pre-flight failure, or a pure-frontend command) the frontend posts its own intent-level `command:error` entry to `POST /projects/:projectId/action-log/errors` (best-effort) before toasting. See `references/adr/0012-command-failure-observability.md`.

**Contract — the primitive must reject for `onFailure` to fire.** `CommandsProvider.run` only invokes `onFailure` when `def.run()` returns a **rejecting promise** or throws synchronously. A command whose `run` delegates to a scope-context primitive (`run: (ctx) => ctx.save()`) therefore only surfaces failures if that primitive **returns its promise** — use `mutateAsync` and return it, not fire-and-forget `.mutate()`. Type the context field `() => Promise<void>` (not `() => void`): that makes a forgotten `return` a compile error rather than a silently-dropped failure. A primitive that opens a dialog, updates local/form state, or fires `.mutate()` returns `void`, so its command's `onFailure` can never fire — don't declare one (the dialog / live-save path owns those errors).

**Convention — declare `onFailure` vs. handle internally:**

- A command with **no dedicated in-place error UI** must declare `onFailure` if it can throw. Without it, a throw only `console.error`s in dev (no toast) — treated as a developer error.
- A command that renders its **own in-place error** (e.g. `suggestion:next` catches a save error and shows it via `ctx.setSaveError`) handles that path internally and does not route it through `onFailure`. It may still declare `onFailure` for the parts that have no in-place UI.
- Pure navigation / local-UI commands (router nav, toggles, font size, opening a dialog) cannot throw — no `onFailure`.

**`onCommandError` filter on `useCommandScope`.** A scope can intercept failures of its own commands to render them in-place instead of the default toast:

```ts
useCommandScope(myScope, ctx, {
  onCommandError: (commandId, error) => {
    // return true to claim the failure (suppresses the default toast + log POST)
    return commandId === "my:thing" && showInline(error);
  },
});
```

Returning `true` suppresses the default handling entirely; returning `false`/`undefined` lets it proceed.

## Typechecking

`bun run typecheck` runs `tsc -b --pretty false`. **Don't change it to `tsc --noEmit`** — the frontend's root `tsconfig.json` has `"files": []` and only `references`, so `tsc --noEmit` checks zero files and silently reports success while VSCode catches real errors per-file via `tsconfig.app.json`. Run `bun run typecheck` before claiming a refactor compiles.

## Data loading (views)

Views load their main content through one consistent path so that pending shows a layout-stable placeholder, a failed fetch shows an in-place `ViewError` + Retry (with a correlation id), and a render throw is recovered rather than white-screening the app. Infrastructure lives in `src/components/data/`.

**The path for a full-view content load:**

1. **Route loader prefetch.** Add a `loader` to the route that prefetches every query the view needs, in parallel, via `Promise.allSettled` of `queryClient.ensureQueryData(getXxxQueryOptions(...))`. `allSettled` (not `all`) means a failing query does not reject the loader, so navigation still completes and the failure surfaces in-render (next step) inside the shell — navbar persists, only the content area swaps.
2. **`useSuspenseQuery` in the component.** Read each prefetched query with `useSuspenseQuery(getXxxSuspenseQueryOptions(...))` — orval generates these (`override.query.useSuspenseQuery` is enabled in `orval.config.ts`); their option type omits `enabled`/`skipToken`, which is what `useSuspenseQuery` accepts (the classic `getXxxQueryOptions` does not typecheck there). The loader's `ensureQueryData` uses the classic `getXxxQueryOptions` — same query key, so the prefetch feeds the suspense read. By the time the component renders, the loader has the data cached, so it doesn't suspend; the envelope is guaranteed defined, so drop the `?.` / empty-fallback defensiveness and the `isLoading`/`isError` branches the boundary now owns. A failed query throws here and is caught by the route's error boundary.
3. **Pending + error are handled by the framework**, not per-component:
   - `defaultPendingComponent` (`ViewPending`, a layout-stable blank shell) shows while the loader is in flight, gated by `defaultPendingMs` (200ms — skip on fast loads) / `defaultPendingMinMs` (300ms — no flash when it does show).
   - `defaultErrorComponent` (`RouteErrorComponent`) catches a view throw at the route level and renders `ViewError` + Retry. Retry resets the query error boundary and re-runs the loader, so failed queries refetch. This is the workhorse boundary.
   - `AppErrorBoundary` (at `ProjectShellLayout`, `QueryErrorResetBoundary` + react-error-boundary + a `Suspense` host) is the outer net for anything thrown outside a route's component subtree.

**Global query policy** (`queryClient.ts`): `throwOnError` routes 5xx + transport/unknown failures to the boundary and leaves 4xx inline (won't self-heal). `retry` skips 4xx and retries server/transport once. `staleTime` is 30s (revisits don't re-pend) and `refetchOnWindowFocus` is on (self-heal). Note: `useSuspenseQuery` always throws regardless of `throwOnError`, so that policy mainly governs classic `useQuery`.

**When to keep classic `useQuery` + inline handling:** only where a query is genuinely conditional/dependent (enabled gated on another query's result) or a small inline section — not as a way to opt a whole view out of the path. A full-view content wait is the trigger to migrate. Resolve a dependent query in the loader when you can; otherwise keep it as classic `useQuery` inside the ready tree.

**Restoration coupling:** view-state restoration (scroll/selection) runs on first render-with-data — gated on the loader-guaranteed ready state, not per-view rAF "wait for content" timing. On a load error the view shows `ViewError` (restoration correctly skipped); after a successful Retry the view reaches ready and restoration runs then. Keep each view's pending placeholder layout-stable (same scroll-container element + dimensions) so `usePersistedScroll`'s target exists and scroll isn't clobbered by a layout shift.
