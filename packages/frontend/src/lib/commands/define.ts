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

interface GlobalCommandInput<Id extends string, A> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
  arg?: CommandArg<A>;
  disabled?: () => string | undefined;
  run: (arg: A) => void | Promise<void>;
}

export const defineGlobalCommand = <Id extends string, A = void>(
  def: GlobalCommandInput<Id, A>,
): GlobalCommandDef<Id, A> => ({ kind: "global", ...def });

interface ScopeCommandInput<Id extends string, A, Ctx> {
  id: Id;
  label: string;
  category: CommandCategory;
  hotkey?: string;
  arg?: CommandArg<A> | ((ctx: Ctx) => CommandArg<A>);
  disabled?: (ctx: Ctx) => string | undefined;
  run: (ctx: Ctx, arg: A) => void | Promise<void>;
}

export const defineScopeCommand = <ScopeId extends string, Id extends string, Ctx, A = void>(
  scope: Scope<Ctx> & { id: ScopeId },
  def: ScopeCommandInput<Id, A, Ctx>,
): ScopeCommandDef<ScopeId, Id, A, Ctx> => ({
  kind: "scope",
  scopeId: scope.id,
  scopeLabel: (scope as ScopeMeta).label,
  ...def,
});
