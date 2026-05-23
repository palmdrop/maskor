import { useCommand } from "../useCommand";

type Params = {
  hasFragment: boolean;
  isDiscarded: boolean;
  onDiscard: () => void;
  onRestore: () => void;
};

export const useFragmentEditorCommands = (params: Params) => {
  useCommand({
    id: "fragment:discard",
    label: "Discard fragment",
    scope: "Fragment",
    category: "navigation", // TODO: wrong category?
    disabledReason: !params.hasFragment
      ? "No fragment to discard"
      : params.isDiscarded
        ? "Fragment is already discarded"
        : undefined,
    run: params.onDiscard,
  });

  useCommand({
    id: "fragment:restore",
    label: "Restore fragment",
    scope: "Fragment",
    category: "navigation", // TODO: wrong category?
    disabledReason: !params.hasFragment
      ? "No fragment to restore"
      : !params.isDiscarded
        ? "Fragment is not discarded"
        : undefined,
    run: params.onRestore,
  });
};
