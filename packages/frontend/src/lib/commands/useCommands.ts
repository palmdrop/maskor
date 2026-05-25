import { useCommandsContext } from "./CommandsProvider";
import type { CommandDef } from "./types";
import type { CommandId, RunArgs } from "./catalog";

// Autocomplete-but-permissive id type. `CommandId | (string & {})` keeps
// suggestions limited to the typed catalog while still accepting raw strings
// (needed during migration while some commands still register via the v1
// adapter). Phase 5 tightens this to `CommandId` only.
type AnyId = CommandId | (string & {});

type RunArgsFor<Id extends AnyId> = Id extends CommandId ? RunArgs<Id> : [arg?: unknown];

interface UseCommandsResult {
  run: <Id extends AnyId>(id: Id, ...args: RunArgsFor<Id>) => void;
  isAvailable: (id: AnyId) => boolean;
  list: () => CommandDef[];
}

export const useCommands = (): UseCommandsResult => {
  const { run, getMap } = useCommandsContext();

  const typedRun = <Id extends AnyId>(id: Id, ...args: RunArgsFor<Id>): void => {
    run(id, args[0]);
  };

  const isAvailable = (id: AnyId): boolean => {
    const def = getMap().get(id);
    return !!def && !def.disabledReason;
  };

  const list = (): CommandDef[] => Array.from(getMap().values());

  return { run: typedRun, isAvailable, list };
};
