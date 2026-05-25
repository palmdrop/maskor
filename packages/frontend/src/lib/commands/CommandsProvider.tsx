import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type {
  AnyCommandDef,
  CommandDef,
  GlobalCommandDef,
  ScopeCommandDef,
  ScopeMeta,
} from "./types";
import { allCommands } from "./catalog";

// =====================================================================
// Active scope tracking
// =====================================================================

export interface ActiveScope {
  readonly meta: ScopeMeta;
  readonly mountOrder: number;
  readonly ctxRef: MutableRefObject<unknown>;
}

// =====================================================================
// Context shape — public, used by useCommands and (legacy) palette/binder.
// =====================================================================

export interface CommandsContextValue {
  // v2: scope publication
  publishScope: (meta: ScopeMeta, ctxRef: MutableRefObject<unknown>) => () => void;
  getActiveScopes: () => readonly ActiveScope[];

  // Unified runtime surface (both v2 catalog and v1 adapter)
  run: (id: string, arg?: unknown) => void;
  getMap: () => ReadonlyMap<string, CommandDef>;

  // v1 adapter surface — kept until Phase 5 cleanup
  register: (def: CommandDef) => void;
  unregister: (id: string) => void;
}

export const CommandsContext = createContext<CommandsContextValue | null>(null);

export const useCommandsContext = (): CommandsContextValue => {
  const context = useContext(CommandsContext);
  if (!context) throw new Error("useCommandsContext must be used within CommandsProvider");
  return context;
};

// =====================================================================
// Legacy-shaped view of a v2 def — keeps palette/hotkey binder uniform.
// Reads ctx lazily via getters so per-row state stays live (mirrors the
// v1 Proxy trick).
// =====================================================================

const makeLegacyViewForGlobal = (def: GlobalCommandDef<string, unknown>): CommandDef => ({
  id: def.id,
  label: def.label,
  scope: "global",
  category: def.category,
  hotkey: def.hotkey,
  arg: def.arg,
  get disabledReason() {
    return def.disabled?.();
  },
  run: (arg) => def.run(arg as never),
});

const makeLegacyViewForScope = (
  def: ScopeCommandDef<string, string, unknown, unknown>,
  getCtx: () => unknown,
): CommandDef => ({
  id: def.id,
  label: def.label,
  scope: def.scopeLabel,
  category: def.category,
  hotkey: def.hotkey,
  get arg() {
    const argSource = def.arg;
    if (!argSource) return undefined;
    if (typeof argSource === "function") return argSource(getCtx());
    return argSource;
  },
  get disabledReason() {
    return def.disabled?.(getCtx());
  },
  run: (arg) => def.run(getCtx(), arg as never),
});

// =====================================================================
// Provider
// =====================================================================

export const CommandsProvider = ({ children }: { children: ReactNode }) => {
  // The merged map is the single mutable source consumers read. Globals from
  // the catalog are inserted once at init; scope-command views are added when
  // their scope publishes (and removed when it unpublishes); adapter-shim
  // entries are added/removed by v1 `useCommand`.
  const mergedMapRef = useRef<Map<string, CommandDef> | null>(null);

  const activeScopesRef = useRef<Map<string, ActiveScope>>(new Map());
  const mountCounterRef = useRef(0);

  // Index of scope command defs by scopeId — used to add/remove views from
  // mergedMap when scopes publish/unpublish.
  const scopeCommandIndexRef = useRef<Map<
    string,
    readonly ScopeCommandDef<string, string, unknown, unknown>[]
  > | null>(null);

  const initIfNeeded = useCallback(() => {
    if (mergedMapRef.current) return;
    const merged = new Map<string, CommandDef>();
    const byScope = new Map<
      string,
      ScopeCommandDef<string, string, unknown, unknown>[]
    >();
    for (const def of allCommands as readonly AnyCommandDef[]) {
      if (def.kind === "global") {
        merged.set(def.id, makeLegacyViewForGlobal(def));
      } else {
        const list = byScope.get(def.scopeId) ?? [];
        list.push(def);
        byScope.set(def.scopeId, list);
      }
    }
    mergedMapRef.current = merged;
    scopeCommandIndexRef.current = byScope;
  }, []);

  const publishScope = useCallback(
    (meta: ScopeMeta, ctxRef: MutableRefObject<unknown>) => {
      initIfNeeded();
      if (import.meta.env.DEV && activeScopesRef.current.has(meta.id)) {
        console.warn(
          `[commands] Scope "${meta.id}" is already published. Last-publish-wins; previous publisher will lose its handlers.`,
        );
      }
      const mountOrder = ++mountCounterRef.current;
      activeScopesRef.current.set(meta.id, { meta, mountOrder, ctxRef });

      const merged = mergedMapRef.current!;
      const scopeDefs = scopeCommandIndexRef.current!.get(meta.id) ?? [];
      const getCtx = () => activeScopesRef.current.get(meta.id)?.ctxRef.current;
      for (const def of scopeDefs) {
        merged.set(def.id, makeLegacyViewForScope(def, getCtx));
      }

      return () => {
        const current = activeScopesRef.current.get(meta.id);
        if (current?.mountOrder !== mountOrder) return;
        activeScopesRef.current.delete(meta.id);
        for (const def of scopeDefs) {
          mergedMapRef.current?.delete(def.id);
        }
      };
    },
    [initIfNeeded],
  );

  const getActiveScopes = useCallback((): readonly ActiveScope[] => {
    return Array.from(activeScopesRef.current.values()).sort(
      (a, b) => b.mountOrder - a.mountOrder, // innermost-first
    );
  }, []);

  const register = useCallback(
    (def: CommandDef) => {
      initIfNeeded();
      const merged = mergedMapRef.current!;
      if (import.meta.env.DEV && merged.has(def.id)) {
        console.warn(
          `[commands] Duplicate command id "${def.id}" registered. Previous registration will be overwritten.`,
        );
      }
      merged.set(def.id, def);
    },
    [initIfNeeded],
  );

  const unregister = useCallback((id: string) => {
    mergedMapRef.current?.delete(id);
  }, []);

  const getMap = useCallback((): ReadonlyMap<string, CommandDef> => {
    initIfNeeded();
    return mergedMapRef.current!;
  }, [initIfNeeded]);

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
      void def.run(arg);
    },
    [getMap],
  );

  const value = useMemo<CommandsContextValue>(
    () => ({ publishScope, getActiveScopes, run, getMap, register, unregister }),
    [publishScope, getActiveScopes, run, getMap, register, unregister],
  );

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>;
};
