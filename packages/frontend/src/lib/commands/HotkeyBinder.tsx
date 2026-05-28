import { useEffect } from "react";
import { useCommandsContext } from "./CommandsProvider";
import { useHandleCommandEvent } from "./useHandleCommandEvent";

export const HotkeyBinder = () => {
  const { getMap, run, getActiveScopes } = useCommandsContext();

  const handler = useHandleCommandEvent({
    onNoEnabledCandidates: (event) => {
      event.preventDefault();
    },
    onWinner: (event, winner) => {
      event.preventDefault();
      run(winner.id);
    },
  });

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [getMap, run, getActiveScopes]);

  return null;
};
