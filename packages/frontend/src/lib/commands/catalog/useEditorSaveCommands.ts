import { useCommand } from "../useCommand";

type Params = {
  canSave: boolean;
  onSave: () => void;
};

export const useEditorSaveCommands = (params: Params) => {
  useCommand({
    id: "editor:save",
    label: "Save",
    scope: "Editor",
    category: "navigation",
    hotkey: "mod+s",
    disabledReason: params.canSave ? undefined : "Nothing to save",
    run: params.onSave,
  });
};
