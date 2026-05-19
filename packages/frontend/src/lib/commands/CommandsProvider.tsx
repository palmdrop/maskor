import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import type { CommandDef } from "./types";
import { staticRegistry } from "./registry";

interface CommandsContextValue {
  register: (def: CommandDef) => void;
  unregister: (id: string) => void;
  run: (id: string, arg?: unknown) => void;
  getMap: () => ReadonlyMap<string, CommandDef>;
}

export const CommandsContext = createContext<CommandsContextValue | null>(null);

export const useCommandsContext = (): CommandsContextValue => {
  const context = useContext(CommandsContext);
  if (!context) throw new Error("useCommandsContext must be used within CommandsProvider");
  return context;
};

export const CommandsProvider = ({ children }: { children: ReactNode }) => {
  const mapRef = useRef<Map<string, CommandDef>>(new Map());

  if (mapRef.current.size === 0) {
    for (const def of staticRegistry) {
      mapRef.current.set(def.id, def);
    }
  }

  const register = useCallback((def: CommandDef) => {
    if (import.meta.env.DEV && mapRef.current.has(def.id)) {
      console.warn(
        `[commands] Duplicate command id "${def.id}" registered. Previous registration will be overwritten.`,
      );
    }
    mapRef.current.set(def.id, def);
  }, []);

  const unregister = useCallback((id: string) => {
    mapRef.current.delete(id);
  }, []);

  const run = useCallback((id: string, arg?: unknown) => {
    const def = mapRef.current.get(id);
    if (!def) {
      console.warn(`[commands] No command registered with id "${id}"`);
      return;
    }
    if (def.disabledReason) {
      console.warn(`[commands] Command "${id}" is disabled: ${def.disabledReason}`);
      return;
    }
    void def.run(arg);
  }, []);

  const getMap = useCallback((): ReadonlyMap<string, CommandDef> => {
    return mapRef.current;
  }, []);

  return (
    <CommandsContext.Provider value={{ register, unregister, run, getMap }}>
      {children}
    </CommandsContext.Provider>
  );
};
