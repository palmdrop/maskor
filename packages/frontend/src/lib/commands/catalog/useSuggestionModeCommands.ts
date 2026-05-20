import { useCommand } from "../useCommand";

interface UseSuggestionModeCommandsParams {
  isLoading: boolean;
  onNext: () => void;
}

export const useSuggestionModeCommands = (params: UseSuggestionModeCommandsParams) => {
  useCommand({
    id: "suggestion:next",
    label: "Next fragment",
    scope: "Suggestion mode",
    category: "navigation",
    hotkey: "mod+enter",
    disabledReason: params.isLoading ? "Loading…" : undefined,
    run: params.onNext,
  });
};
