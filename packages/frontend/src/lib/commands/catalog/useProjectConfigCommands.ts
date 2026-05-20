import { useCommand } from "../useCommand";

interface UseProjectConfigCommandsParams {
  rebuildIndexPending: boolean;
  onRebuildIndex: () => void;
}

export const useProjectConfigCommands = (params: UseProjectConfigCommandsParams) => {
  useCommand({
    id: "config:rebuild-index",
    label: "Rebuild index",
    scope: "Project config",
    category: "project",
    disabledReason: params.rebuildIndexPending ? "Rebuilding…" : undefined,
    run: params.onRebuildIndex,
  });
};
