Use the generated orval client for every API call. Do not hand-roll `useMutation` / `useQuery` against `customFetch` — that bypasses generated types and route schemas.

Generated hooks live under `src/api/generated/<tag>/<tag>.ts` (one file per OpenAPI tag), e.g. `useCreateProject`, `useUpdateProject`. Schemas live in `src/api/generated/maskorAPI.schemas.ts`.

When you add or change an API route (new endpoint, new field, new mode), regenerate the client:

1. In `packages/api`, run `bun run generate-openapi` to refresh the committed snapshot (`src/api/openapi.json`). No server needed — the spec is generated in-process from the route definitions.
2. From `packages/frontend`, run `bun run codegen`. It runs orval against the committed snapshot — the API does not need to be running.
3. Use the regenerated hook in the frontend. Delete any hand-rolled mutation that the regenerated hook replaces.

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

## Typechecking

`bun run typecheck` runs `tsc -b --pretty false`. **Don't change it to `tsc --noEmit`** — the frontend's root `tsconfig.json` has `"files": []` and only `references`, so `tsc --noEmit` checks zero files and silently reports success while VSCode catches real errors per-file via `tsconfig.app.json`. Run `bun run typecheck` before claiming a refactor compiles.
