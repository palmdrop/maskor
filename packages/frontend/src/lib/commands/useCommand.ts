import { useEffect, useRef } from "react";
import type { CommandDef } from "./types";
import { useCommandsContext } from "./CommandsProvider";

export const useCommand = (def: CommandDef) => {
  const { register, unregister } = useCommandsContext();
  const defRef = useRef<CommandDef>(def);
  defRef.current = def;

  useEffect(() => {
    // Proxy reads every field live from the ref. Spec contract: the registered
    // def always reflects the latest render, so arg.items closures over state
    // (e.g. projectId) stay current across re-renders of the host component.
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
