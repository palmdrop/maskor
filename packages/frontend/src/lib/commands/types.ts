import type { ReactNode } from "react";
import type { CommandInputBase } from "./define";

// =====================================================================
// Shared primitives
// =====================================================================

export type CommandCategory = "navigation" | "create" | "project" | "attach" | "other";

// CommandArg shape used by the *legacy view* the palette and hotkey binder
// read from. `items` is always a parameterless thunk here — scope commands'
// ctx-taking items get curried with the current ctx at view-build time, so
// downstream consumers never see ctx.
//
// `NoInfer<T>` on the getter/renderer params keeps `T` from being inferred
// from those sites. When this type appears in a user-facing input position,
// inference flows only from `items`, which is the single inference handle
// authors actually want.
export interface CommandArg<T = unknown> {
  items: () => readonly T[] | Promise<readonly T[]>;
  getKey: (item: NoInfer<T>) => string;
  getLabel: (item: NoInfer<T>) => string;
  renderItem?: (item: NoInfer<T>) => ReactNode;
  placeholder?: string;
}

// Scope-command input shape — same as CommandArg except `items` takes the
// scope's ctx so commands can derive their item set from published state.
export interface ScopeCommandArg<T, Ctx> {
  items: (ctx: Ctx) => readonly T[] | Promise<readonly T[]>;
  getKey: (item: NoInfer<T>) => string;
  getLabel: (item: NoInfer<T>) => string;
  renderItem?: (item: NoInfer<T>) => ReactNode;
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

// Resolved presentation for a command failure: a friendly headline and an
// optional technical detail line shown in the toast description.
export interface CommandFailureInfo {
  message: string;
  detail?: string;
}

// Declared per command. String form is a static friendly message; function form
// derives message/detail from the thrown error. Its presence opts the command
// into the default failure handling (toast + action-log entry) in
// CommandsProvider.run; commands without it are expected to handle errors
// internally (e.g. in-place UI). See packages/frontend/CLAUDE.md.
export type OnFailure = string | ((error: unknown) => CommandFailureInfo);

interface CommonCommandDef {
  readonly label: string;
  readonly category: CommandCategory;
  readonly hotkey?: string;
  readonly onFailure?: OnFailure;
}

// `RunArgs` collapses the second-arg tuple to `[]` when A is void, so a
// no-arg command's stored .run can be called as `cmd.run(ctx)` rather than
// `cmd.run(ctx, undefined as never)`.
type RunArgs<A> = [A] extends [void] ? [] : [arg: A];

export interface GlobalCommandDef<Id extends string = string, A = void> extends CommonCommandDef {
  readonly kind: "global";
  readonly id: Id;
  readonly arg?: CommandArg<A>;
  readonly disabled?: () => string | undefined;
  readonly run: (...args: RunArgs<A>) => void | Promise<void>;
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
  readonly arg?: ScopeCommandArg<A, Ctx>;
  readonly disabled?: (ctx: Ctx) => string | undefined;
  readonly run: (ctx: Ctx, ...args: RunArgs<A>) => void | Promise<void>;
}

export type AnyCommandDef =
  | GlobalCommandDef<string, unknown>
  | ScopeCommandDef<string, string, unknown, unknown>;

// =====================================================================
// Flattened view consumed by the palette and hotkey binder.
// Global commands have scope "global"; scope commands carry the scope id.
// Lazy getters (disabledReason, arg.items) read live state through a ctx
// ref so per-row state stays fresh without re-rendering.
// =====================================================================

export interface MergedCommandView<T = unknown> extends CommandInputBase<string> {
  scope: string; // "global" or scope id
  arg?: CommandArg<T>;
  disabledReason?: string;
  onFailure?: OnFailure;
  run: (arg?: T) => void | Promise<void>;
}
