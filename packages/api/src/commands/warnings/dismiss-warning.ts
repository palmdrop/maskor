import type { DismissResult } from "@maskor/storage";
import type { Command } from "../types";

export type DismissWarningInput = {
  id: string;
};

// Dismissing a warning is a low-level housekeeping action, not a content edit — like swap, it
// emits no action-log entry. It still flows through the command pipeline per the API convention
// that mutations are not called directly from route handlers.
export const dismissWarningCommand: Command<DismissWarningInput, DismissResult> = {
  async execute(ctx, input) {
    const result = await ctx.storageService.warnings.dismiss(ctx.projectContext, input.id);
    return { result, logEntries: [] };
  },
};
