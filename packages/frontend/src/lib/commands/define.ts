import type {
  GlobalCommandDef,
  Scope,
  ScopeCommandArg,
  ScopeCommandDef,
  ScopeMeta,
  CommandArg,
  CommandCategory,
  OnFailure,
} from "./types";

export const defineScope = <Ctx>(id: string, meta: { label: string }): Scope<Ctx> =>
  ({ id, label: meta.label }) as Scope<Ctx>;

export interface CommandInputBase<Id extends string> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string | string[];
  onFailure?: OnFailure;
}

// =====================================================================
// defineGlobalCommand
//
// Two overloads — with-arg (parameterized, A inferred from arg.items's
// return type) and no-arg (A = void). `arg` is always a plain object with
// `items` as a function — the earlier "function returning CommandArg<A>"
// shape defeated inference because TS won't push a target type through a
// callback whose return is itself a generic object literal. Flat-items
// gives `A` a single inference site (`items: () => readonly A[] | …`).
// =====================================================================

interface GlobalCommandInputWithArg<Id extends string, A> extends CommandInputBase<Id> {
  arg: CommandArg<A>;
  disabled?: () => string | undefined;
  run: (arg: A) => void | Promise<void>;
}

interface GlobalCommandInputNoArg<Id extends string> extends CommandInputBase<Id> {
  arg?: undefined;
  disabled?: () => string | undefined;
  run: () => void | Promise<void>;
}

export function defineGlobalCommand<Id extends string, A>(
  def: GlobalCommandInputWithArg<Id, A>,
): GlobalCommandDef<Id, A>;
export function defineGlobalCommand<Id extends string>(
  def: GlobalCommandInputNoArg<Id>,
): GlobalCommandDef<Id, void>;
// `any` impl signature — keeps the body compatible with each overload's
// narrower return type (contravariance otherwise blocks the wider impl).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineGlobalCommand(def: any): any {
  return { kind: "global", ...def };
}

// =====================================================================
// defineScopeCommand — same overload pattern; `arg.items` takes the
// scope's ctx so commands can derive items from published state.
// =====================================================================

interface ScopeCommandInputWithArg<Id extends string, A, Ctx> extends CommandInputBase<Id> {
  arg: ScopeCommandArg<A, Ctx>;
  disabled?: (ctx: Ctx) => string | undefined;
  run: (ctx: Ctx, arg: A) => void | Promise<void>;
}

interface ScopeCommandInputNoArg<Id extends string, Ctx> extends CommandInputBase<Id> {
  arg?: undefined;
  disabled?: (ctx: Ctx) => string | undefined;
  run: (ctx: Ctx) => void | Promise<void>;
}

export function defineScopeCommand<ScopeId extends string, Id extends string, Ctx, A>(
  scope: Scope<Ctx> & { id: ScopeId },
  def: ScopeCommandInputWithArg<Id, A, Ctx>,
): ScopeCommandDef<ScopeId, Id, A, Ctx>;
export function defineScopeCommand<ScopeId extends string, Id extends string, Ctx>(
  scope: Scope<Ctx> & { id: ScopeId },
  def: ScopeCommandInputNoArg<Id, Ctx>,
): ScopeCommandDef<ScopeId, Id, void, Ctx>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineScopeCommand(scope: any, def: any): any {
  return {
    kind: "scope",
    scopeId: scope.id,
    scopeLabel: (scope as ScopeMeta).label,
    ...def,
  };
}
