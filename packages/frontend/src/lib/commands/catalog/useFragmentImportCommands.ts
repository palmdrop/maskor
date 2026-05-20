import { useCommand } from "../useCommand";

interface UseFragmentImportCommandsParams {
  canImport: boolean;
  onImport: () => void;
}

export const useFragmentImportCommands = (params: UseFragmentImportCommandsParams) => {
  useCommand({
    id: "fragment-import:import",
    label: "Import fragments",
    scope: "Fragment import",
    category: "create",
    disabledReason: params.canImport ? undefined : "No fragments to import",
    run: params.onImport,
  });
};
