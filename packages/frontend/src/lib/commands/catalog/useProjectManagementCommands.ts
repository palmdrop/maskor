import { useCommand } from "../useCommand";

interface UseProjectManagementCommandsParams {
  canSaveSettings: boolean;
  onSaveSettings: () => void;
}

export const useProjectManagementCommands = (params: UseProjectManagementCommandsParams) => {
  useCommand({
    id: "project-management:save-settings",
    label: "Save settings",
    scope: "Project management",
    category: "project",
    disabledReason: params.canSaveSettings ? undefined : "No changes to save",
    run: params.onSaveSettings,
  });
};
