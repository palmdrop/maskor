import { useEffect, useRef } from "react";
import type { CommandDef } from "./types";
import { useCommandsContext } from "./CommandsProvider";

// Legacy adapter — kept while phases 2–4 migrate every call site to the v2
// scope-context API. Removed in Phase 5. New code MUST use defineGlobalCommand
// / defineScopeCommand + useCommandScope instead.
export const useCommand = <T = unknown>(def: CommandDef<T>) => {
  const { register, unregister } = useCommandsContext();
  const defRef = useRef<CommandDef<T>>(def);
  defRef.current = def;

  useEffect(() => {
    // Proxy reads every field live from the ref so the registered def always
    // reflects the latest render (closures over component state stay current).
    const liveDef = new Proxy({} as CommandDef, {
      get: (_target, prop) => defRef.current[prop as keyof CommandDef],
      has: (_target, prop) => prop in defRef.current,
      ownKeys: () => Reflect.ownKeys(defRef.current),
      getOwnPropertyDescriptor: (_target, prop) =>
        Reflect.getOwnPropertyDescriptor(defRef.current, prop),
    });
    register(liveDef);
    return () => unregister(def.id);
  }, [def.id, register, unregister]);
};
