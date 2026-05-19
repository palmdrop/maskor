import { useCommandsContext } from "./CommandsProvider";
import type { CommandDef } from "./types";

interface UseCommandsResult {
  run: (id: string, arg?: unknown) => void;
  isAvailable: (id: string) => boolean;
  list: () => CommandDef[];
}

export const useCommands = (): UseCommandsResult => {
  const { run, getMap } = useCommandsContext();

  const isAvailable = (id: string): boolean => {
    const def = getMap().get(id);
    return !!def && !def.disabledReason;
  };

  const list = (): CommandDef[] => Array.from(getMap().values());

  return { run, isAvailable, list };
};
