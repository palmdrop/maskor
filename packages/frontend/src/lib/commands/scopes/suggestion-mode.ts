import type { RefObject } from "react";
import type { FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { defineScope, defineScopeCommand } from "../define";

export interface SuggestionModeContext {
  fragmentId: string | null;
  editorRef: RefObject<FragmentEditorHandle | null>;
  isLoading: boolean;
  hasPrevious: boolean;
  loadNext: (excludeUuid?: string) => Promise<void>;
  goBack: () => void;
  setSaveError: (error: string | null) => void;
}

export const suggestionModeScope = defineScope<SuggestionModeContext>("suggestion-mode", {
  label: "Suggestion mode",
});

// Composed action: save the editor, then advance to the next suggestion. The
// component publishes only primitives — composition lives here.
const next = defineScopeCommand(suggestionModeScope, {
  id: "suggestion:next",
  label: "Next fragment",
  category: "navigation",
  hotkey: "mod+enter",
  disabled: (ctx) => (ctx.isLoading ? "Loading…" : undefined),
  run: async (ctx) => {
    const currentFragmentId = ctx.fragmentId;
    if (ctx.editorRef.current) {
      try {
        await ctx.editorRef.current.save();
      } catch (error) {
        ctx.setSaveError(
          error instanceof Error ? error.message : "Save failed. Fix errors before continuing.",
        );
        return;
      }
    }
    await ctx.loadNext(currentFragmentId ?? undefined);
  },
});

const previous = defineScopeCommand(suggestionModeScope, {
  id: "suggestion:previous",
  label: "Previous fragment",
  category: "navigation",
  disabled: (ctx) => (ctx.hasPrevious ? undefined : "No previous fragment"),
  run: (ctx) => {
    ctx.goBack();
  },
});

export const suggestionModeCommands = [next, previous] as const;
