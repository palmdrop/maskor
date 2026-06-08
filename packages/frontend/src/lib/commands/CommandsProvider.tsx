import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import type {
  AnyCommandDef,
  MergedCommandView,
  GlobalCommandDef,
  ScopeCommandDef,
  ScopeMeta,
  OnFailure,
  CommandFailureInfo,
} from "./types";
import { allCommands } from "./catalog";
import { ApiRequestError } from "@api/errors";
import { RecordCommandError } from "@api/generated/action-log/action-log";
import { getActiveProjectId } from "./router-helpers";

// A scope may intercept failures of its own commands to render them in-place
// instead of the default toast. Returning `true` suppresses the default handling.
export type CommandErrorFilter = (commandId: string, error: unknown) => boolean | void;

const resolveFailureInfo = (onFailure: OnFailure, error: unknown): CommandFailureInfo =>
  typeof onFailure === "string" ? { message: onFailure } : onFailure(error);

// =====================================================================
// Active scope tracking
// =====================================================================

export interface ActiveScope {
  readonly meta: ScopeMeta;
  readonly mountOrder: number;
  readonly ctxRef: RefObject<unknown>;
  readonly onCommandError?: CommandErrorFilter;
}

// =====================================================================
// Context shape
// =====================================================================

export interface CommandsContextValue {
  publishScope: (
    meta: ScopeMeta,
    ctxRef: RefObject<unknown>,
    onCommandError?: CommandErrorFilter,
  ) => () => void;
  getActiveScopes: () => readonly ActiveScope[];
  run: (id: string, arg?: unknown) => void;
  getMap: () => ReadonlyMap<string, MergedCommandView>;
}

export const CommandsContext = createContext<CommandsContextValue | null>(null);

export const useCommandsContext = (): CommandsContextValue => {
  const context = useContext(CommandsContext);
  if (!context) throw new Error("useCommandsContext must be used within CommandsProvider");
  return context;
};

// =====================================================================
// Flattened views of v2 defs — uniform shape for the palette and binder.
// Lazy getters keep per-row state live as ctx changes between renders.
// =====================================================================

const makeViewForGlobal = (def: GlobalCommandDef<string, unknown>): MergedCommandView => ({
  id: def.id,
  label: def.label,
  scope: "global",
  category: def.category,
  hotkey: def.hotkey,
  arg: def.arg,
  onFailure: def.onFailure,
  get disabledReason() {
    return def.disabled?.();
  },
  run: (arg) => def.run(arg as never),
});

const makeViewForScope = (
  def: ScopeCommandDef<string, string, unknown, unknown>,
  getCtx: () => unknown,
): MergedCommandView => ({
  id: def.id,
  label: def.label,
  scope: def.scopeId,
  category: def.category,
  hotkey: def.hotkey,
  onFailure: def.onFailure,
  // Scope commands' `arg.items` takes ctx; the view exposes a parameterless
  // thunk by capturing getCtx() so the palette and binder don't need ctx.
  get arg() {
    const argSource = def.arg;
    if (!argSource) return undefined;
    return {
      items: () => {
        const ctx = getCtx();
        if (ctx === undefined) return [];
        return argSource.items(ctx);
      },
      getKey: argSource.getKey,
      getLabel: argSource.getLabel,
      renderItem: argSource.renderItem,
      placeholder: argSource.placeholder,
    };
  },
  get disabledReason() {
    const ctx = getCtx();
    if (ctx === undefined) return undefined;
    return def.disabled?.(ctx);
  },
  run: (arg) => def.run(getCtx(), arg as never),
});

// =====================================================================
// Provider
// =====================================================================

interface CatalogEntry {
  readonly def: AnyCommandDef;
  readonly view: MergedCommandView;
}

export const CommandsProvider = ({ children }: { children: ReactNode }) => {
  const catalogRef = useRef<Map<string, CatalogEntry> | null>(null);
  const mergedMapRef = useRef<Map<string, MergedCommandView> | null>(null);
  const activeScopesRef = useRef<Map<string, ActiveScope>>(new Map());
  const mountCounterRef = useRef(0);

  const initIfNeeded = useCallback(() => {
    if (catalogRef.current) return;
    const catalog = new Map<string, CatalogEntry>();
    const merged = new Map<string, MergedCommandView>();
    for (const def of allCommands as readonly AnyCommandDef[]) {
      if (def.kind === "global") {
        const entry = { def, view: makeViewForGlobal(def) };
        catalog.set(def.id, entry);
        merged.set(def.id, entry.view);
      } else {
        const scopeId = def.scopeId;
        const getCtx = () => activeScopesRef.current.get(scopeId)?.ctxRef.current;
        catalog.set(def.id, { def, view: makeViewForScope(def, getCtx) });
        // Scope command views are added to mergedMap only when their scope
        // is published.
      }
    }
    catalogRef.current = catalog;
    mergedMapRef.current = merged;
  }, []);

  const publishScope = useCallback(
    (meta: ScopeMeta, ctxRef: RefObject<unknown>, onCommandError?: CommandErrorFilter) => {
      initIfNeeded();
      if (import.meta.env.DEV && activeScopesRef.current.has(meta.id)) {
        console.warn(
          `[commands] Scope "${meta.id}" is already published. Last-publish-wins; previous publisher will lose its handlers.`,
        );
      }
      const mountOrder = ++mountCounterRef.current;
      activeScopesRef.current.set(meta.id, { meta, mountOrder, ctxRef, onCommandError });

      const merged = mergedMapRef.current!;
      const addedIds: string[] = [];
      for (const entry of catalogRef.current!.values()) {
        if (entry.def.kind === "scope" && entry.def.scopeId === meta.id) {
          merged.set(entry.def.id, entry.view);
          addedIds.push(entry.def.id);
        }
      }

      return () => {
        const current = activeScopesRef.current.get(meta.id);
        if (current?.mountOrder !== mountOrder) return;
        activeScopesRef.current.delete(meta.id);
        for (const id of addedIds) mergedMapRef.current?.delete(id);
      };
    },
    [initIfNeeded],
  );

  const getActiveScopes = useCallback((): readonly ActiveScope[] => {
    return Array.from(activeScopesRef.current.values()).sort(
      (a, b) => b.mountOrder - a.mountOrder, // innermost-first
    );
  }, []);

  const getMap = useCallback((): ReadonlyMap<string, MergedCommandView> => {
    initIfNeeded();
    return mergedMapRef.current!;
  }, [initIfNeeded]);

  const handleFailure = useCallback((view: MergedCommandView, error: unknown) => {
    // A scope may claim the failure (in-place UI) and suppress the default path.
    if (view.scope !== "global") {
      const filter = activeScopesRef.current.get(view.scope)?.onCommandError;
      if (filter?.(view.id, error) === true) return;
    }

    const { message, detail } = resolveFailureInfo(view.onFailure!, error);

    // If the backend already logged it (correlationId on the response), only
    // toast. Otherwise this never reached a backend command — post our own
    // intent-level command:error entry (best-effort), then toast.
    const correlationId = error instanceof ApiRequestError ? error.correlationId : undefined;
    if (!correlationId) {
      const projectId = getActiveProjectId();
      if (projectId) {
        void RecordCommandError(projectId, {
          commandId: view.id,
          correlationId: crypto.randomUUID(),
          friendlyMessage: message,
          technicalMessage: error instanceof Error ? error.message : String(error),
        }).catch(() => {
          // best-effort: a failed log POST must not mask the original failure
        });
      }
    }

    toast.error(message, detail ? { description: detail } : undefined);
  }, []);

  const run = useCallback(
    (id: string, arg?: unknown) => {
      const def = getMap().get(id);
      if (!def) {
        console.warn(`[commands] No command registered with id "${id}"`);
        return;
      }
      if (def.disabledReason) {
        console.warn(`[commands] Command "${id}" is disabled: ${def.disabledReason}`);
        return;
      }
      const onError = (error: unknown) => {
        if (def.onFailure) {
          handleFailure(def, error);
        } else if (import.meta.env.DEV) {
          // No onFailure declared: a thrown command is a developer error — it
          // must declare onFailure or handle errors internally.
          console.error(`[commands] Command "${id}" threw without onFailure:`, error);
        }
      };

      // Run synchronously so synchronous commands stay synchronous (the palette,
      // hotkey binder, and tests observe their effects immediately). Catch both
      // a synchronous throw and a rejected promise.
      let outcome: void | Promise<void>;
      try {
        outcome = def.run(arg);
      } catch (error) {
        onError(error);
        return;
      }
      if (outcome instanceof Promise) {
        void outcome.catch(onError);
      }
    },
    [getMap, handleFailure],
  );

  const value = useMemo<CommandsContextValue>(
    () => ({ publishScope, getActiveScopes, run, getMap }),
    [publishScope, getActiveScopes, run, getMap],
  );

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>;
};
