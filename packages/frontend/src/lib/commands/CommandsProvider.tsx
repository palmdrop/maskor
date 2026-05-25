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
// Context shape
// =====================================================================

export interface CommandsContextValue {
  publishScope: (meta: ScopeMeta, ctxRef: MutableRefObject<unknown>) => () => void;
  getActiveScopes: () => readonly ActiveScope[];
  run: (id: string, arg?: unknown) => void;
  getMap: () => ReadonlyMap<string, CommandDef>;
}

export const CommandsContext = createContext<CommandsContextValue | null>(null);

export const useCommandsContext = (): CommandsContextValue => {
  const context = useContext(CommandsContext);
  if (!context) throw new Error("useCommandsContext must be used within CommandsProvider");
  return context;
};

// =====================================================================
// Legacy-shaped view of a v2 def — keeps the palette and hotkey binder
// reading one uniform shape. Lazy getters keep per-row state live as
// ctx changes between renders.
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

interface CatalogEntry {
  readonly def: AnyCommandDef;
  readonly view: CommandDef;
}

export const CommandsProvider = ({ children }: { children: ReactNode }) => {
  const catalogRef = useRef<Map<string, CatalogEntry> | null>(null);
  const mergedMapRef = useRef<Map<string, CommandDef> | null>(null);
  const activeScopesRef = useRef<Map<string, ActiveScope>>(new Map());
  const mountCounterRef = useRef(0);

  const initIfNeeded = useCallback(() => {
    if (catalogRef.current) return;
    const catalog = new Map<string, CatalogEntry>();
    const merged = new Map<string, CommandDef>();
    for (const def of allCommands as readonly AnyCommandDef[]) {
      if (def.kind === "global") {
        const entry = { def, view: makeLegacyViewForGlobal(def) };
        catalog.set(def.id, entry);
        merged.set(def.id, entry.view);
      } else {
        const scopeId = def.scopeId;
        const getCtx = () => activeScopesRef.current.get(scopeId)?.ctxRef.current;
        catalog.set(def.id, { def, view: makeLegacyViewForScope(def, getCtx) });
        // Scope command views are added to mergedMap only when their scope
        // is published.
      }
    }
    catalogRef.current = catalog;
    mergedMapRef.current = merged;
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
    () => ({ publishScope, getActiveScopes, run, getMap }),
    [publishScope, getActiveScopes, run, getMap],
  );

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>;
};
