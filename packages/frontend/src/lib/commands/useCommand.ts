import { useEffect, useRef } from "react";
import type { CommandDef } from "./types";
import { useCommandsContext } from "./CommandsProvider";

export const useCommand = (def: CommandDef) => {
  const { register, unregister } = useCommandsContext();
  const defRef = useRef<CommandDef>(def);
  defRef.current = def;

  useEffect(() => {
    const stableDef: CommandDef = {
      ...defRef.current,
      // Read live from ref so state-derived values (disabledReason, run) are never stale.
      get disabledReason() {
        return defRef.current.disabledReason;
      },
      run: (arg?: unknown) => defRef.current.run(arg),
    };
    register(stableDef);
    return () => unregister(stableDef.id);
  }, [def.id, register, unregister]);
};
