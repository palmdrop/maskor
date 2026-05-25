import type {
  GlobalCommandDef,
  Scope,
  ScopeCommandDef,
  ScopeMeta,
  CommandArg,
  CommandCategory,
} from "./types";

export const defineScope = <Ctx>(id: string, meta: { label: string }): Scope<Ctx> =>
  ({ id, label: meta.label }) as Scope<Ctx>;

// =====================================================================
// defineGlobalCommand — two overloads so the arg type is inferred from
// the `arg` field when present, and defaults to `void` when absent. The
// overloads exist purely for call-site inference; the implementation is
// the same in both shapes.
// =====================================================================

interface GlobalCommandInputWithArg<Id extends string, A> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
  arg: CommandArg<A>;
  disabled?: () => string | undefined;
  run: (arg: A) => void | Promise<void>;
}

interface GlobalCommandInputNoArg<Id extends string> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
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
export function defineGlobalCommand(
  def: GlobalCommandInputWithArg<string, unknown> | GlobalCommandInputNoArg<string>,
): GlobalCommandDef<string, unknown> {
  return { kind: "global", ...def } as GlobalCommandDef<string, unknown>;
}

// =====================================================================
// defineScopeCommand — same overload trick. The parameterized overload
// requires `arg` and infers A from it; the simple overload omits `arg`
// and pins A to void so the run signature is `(ctx) => …`.
// =====================================================================

interface ScopeCommandInputWithArg<Id extends string, A, Ctx> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
  arg: CommandArg<A> | ((ctx: Ctx) => CommandArg<A>);
  disabled?: (ctx: Ctx) => string | undefined;
  run: (ctx: Ctx, arg: A) => void | Promise<void>;
}

interface ScopeCommandInputNoArg<Id extends string, Ctx> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
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
export function defineScopeCommand<ScopeId extends string, Ctx>(
  scope: Scope<Ctx> & { id: ScopeId },
  def:
    | ScopeCommandInputWithArg<string, unknown, Ctx>
    | ScopeCommandInputNoArg<string, Ctx>,
): ScopeCommandDef<ScopeId, string, unknown, Ctx> {
  return {
    kind: "scope",
    scopeId: scope.id,
    scopeLabel: (scope as ScopeMeta).label,
    ...def,
  } as ScopeCommandDef<ScopeId, string, unknown, Ctx>;
}
