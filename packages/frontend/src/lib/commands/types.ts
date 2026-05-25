import type { ReactNode } from "react";

// =====================================================================
// Shared primitives
// =====================================================================

export type CommandCategory = "navigation" | "create" | "project" | "attach" | "other";

export interface CommandArg<T = unknown> {
  items: readonly T[] | (() => T[] | Promise<T[]>);
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem?: (item: T) => ReactNode;
  placeholder?: string;
}

// =====================================================================
// v2: scopes
// =====================================================================

declare const _ctxBrand: unique symbol;

export interface ScopeMeta {
  readonly id: string;
  readonly label: string;
}

export interface Scope<Ctx> extends ScopeMeta {
  // Phantom field — carries the context type at the type level without
  // existing at runtime. Used so defineScopeCommand can constrain `ctx`.
  readonly [_ctxBrand]?: (ctx: Ctx) => void;
}

export type ContextOf<S> = S extends Scope<infer Ctx> ? Ctx : never;

// =====================================================================
// v2: command definitions
// =====================================================================

interface CommonCommandDef {
  readonly label: string;
  readonly category: CommandCategory;
  readonly hotkey?: string;
}

export interface GlobalCommandDef<Id extends string = string, A = void>
  extends CommonCommandDef {
  readonly kind: "global";
  readonly id: Id;
  readonly arg?: CommandArg<A>;
  readonly disabled?: () => string | undefined;
  readonly run: (arg: A) => void | Promise<void>;
}

export interface ScopeCommandDef<
  ScopeId extends string = string,
  Id extends string = string,
  A = void,
  Ctx = unknown,
> extends CommonCommandDef {
  readonly kind: "scope";
  readonly id: Id;
  readonly scopeId: ScopeId;
  readonly scopeLabel: string;
  readonly arg?: CommandArg<A> | ((ctx: Ctx) => CommandArg<A>);
  readonly disabled?: (ctx: Ctx) => string | undefined;
  readonly run: (ctx: Ctx, arg: A) => void | Promise<void>;
}

export type AnyCommandDef =
  | GlobalCommandDef<string, unknown>
  | ScopeCommandDef<string, string, unknown, unknown>;

// =====================================================================
// v1 compatibility — kept so the adapter shim and legacy palette code
// can still talk about a uniform command shape during migration.
// Removed in Phase 5.
// =====================================================================

export type CommandScope = "global" | string;

export interface CommandDef<T = unknown> {
  id: string;
  label: string;
  scope: CommandScope;
  category: CommandCategory;
  hotkey?: string;
  arg?: CommandArg<T>;
  disabledReason?: string;
  run: (arg?: T) => void | Promise<void>;
}
