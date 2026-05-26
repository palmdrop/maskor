import { useMemo } from "react";
import { useCommandsContext } from "./CommandsProvider";
import type { MergedCommandView } from "./types";
import type { CommandId, RunArgs } from "./catalog";

interface UseCommandsResult {
  run: <Id extends CommandId>(id: Id, ...args: RunArgs<Id>) => void;
  isAvailable: (id: CommandId) => boolean;
  list: () => MergedCommandView[];
}

export const useCommands = (): UseCommandsResult => {
  const { run, getMap } = useCommandsContext();

  return useMemo(
    () => ({
      run: <Id extends CommandId>(id: Id, ...args: RunArgs<Id>): void => {
        run(id, args[0]);
      },
      isAvailable: (id: CommandId): boolean => {
        const def = getMap().get(id);
        return !!def && !def.disabledReason;
      },
      list: (): MergedCommandView[] => Array.from(getMap().values()),
    }),
    [run, getMap],
  );
};
