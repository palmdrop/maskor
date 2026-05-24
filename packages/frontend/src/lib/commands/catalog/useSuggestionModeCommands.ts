import { useCommand } from "../useCommand";

interface UseSuggestionModeCommandsParams {
  isLoading: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
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

  useCommand({
    id: "suggestion:previous",
    label: "Previous fragment",
    scope: "Suggestion mode",
    category: "navigation",
    disabledReason: !params.hasPrevious ? "No previous fragment" : undefined,
    run: params.onPrevious,
  });
};
