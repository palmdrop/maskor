import { globalCommands } from "./global";
import { scopeCommands } from "./scopes";
import type { GlobalCommandDef, ScopeCommandDef } from "./types";

// The catalog is the single source of truth for the typed command registry.
// At runtime, the provider iterates `allCommands` to build its lookup maps.
// At the type level, `CommandId` and `ArgFor<Id>` are derived from the same
// tuple, so `commands.run("id", arg)` is fully typed.

export const allCommands = [...globalCommands, ...scopeCommands] as const;

type AnyCommandInCatalog = (typeof allCommands)[number];

export type CommandId = AnyCommandInCatalog["id"];

// Extract<…, { id: Id }> picks the right def for the requested ID. The arg type
// then follows from the def's `arg` shape — `void` (no arg) or `CommandArg<A>`.
type CommandById<Id extends CommandId> = Extract<AnyCommandInCatalog, { id: Id }>;

export type ArgFor<Id extends CommandId> =
  CommandById<Id> extends GlobalCommandDef<Id, infer A>
    ? A
    : CommandById<Id> extends ScopeCommandDef<string, Id, infer A, unknown>
      ? A
      : never;

// `commands.run(id, arg)` becomes `commands.run(id)` for void-arg commands
// and `commands.run(id, arg)` for parameterized ones. The conditional in
// `RunArgs` collapses the tuple so void-arg call sites don't have to pass
// `undefined`.
export type RunArgs<Id extends CommandId> = [ArgFor<Id>] extends [void] ? [] : [arg: ArgFor<Id>];
