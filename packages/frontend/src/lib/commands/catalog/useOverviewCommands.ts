import { useCommand } from "../useCommand";

interface UseOverviewCommandsParams {
  canDesignateMain: boolean;
  onDesignateMain: () => void;
  createSectionPending: boolean;
  onCreateSection: () => void;
  confirmingDeleteSectionId: string | null;
  onDeleteSection: () => void;
}

export const useOverviewCommands = (params: UseOverviewCommandsParams) => {
  useCommand({
    id: "overview:designate-main",
    label: "Make main",
    scope: "Overview",
    category: "project",
    disabledReason: params.canDesignateMain
      ? undefined
      : "This sequence is already the main sequence",
    run: params.onDesignateMain,
  });

  useCommand({
    id: "overview:add-section",
    label: "Add section",
    scope: "Overview",
    category: "create",
    disabledReason: params.createSectionPending ? "Adding section…" : undefined,
    run: params.onCreateSection,
  });

  useCommand({
    id: "overview:delete-section",
    label: "Delete section",
    scope: "Overview",
    category: "other",
    disabledReason:
      params.confirmingDeleteSectionId === null ? "No section selected for deletion" : undefined,
    run: params.onDeleteSection,
  });
};
