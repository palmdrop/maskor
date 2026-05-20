import { useCommand } from "../useCommand";

interface UseSequenceSidebarCommandsParams {
  createSequencePending: boolean;
  onCreateSequence: () => void;
  confirmingDeleteId: string | null;
  onDeleteSequence: () => void;
}

export const useSequenceSidebarCommands = (params: UseSequenceSidebarCommandsParams) => {
  useCommand({
    id: "overview:create-sequence",
    label: "New sequence",
    scope: "Overview",
    category: "create",
    disabledReason: params.createSequencePending ? "Creating…" : undefined,
    run: params.onCreateSequence,
  });

  useCommand({
    id: "overview:delete-sequence",
    label: "Delete sequence",
    scope: "Overview",
    category: "other",
    disabledReason:
      params.confirmingDeleteId === null ? "No sequence selected for deletion" : undefined,
    run: params.onDeleteSequence,
  });
};
