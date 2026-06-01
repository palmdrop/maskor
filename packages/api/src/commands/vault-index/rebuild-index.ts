import type { Command } from "../types";
import type { RebuildStats } from "@maskor/storage";

// Re-derive the vault index from the vault files. A re-derivation/maintenance operation rather
// than a content mutation, so it emits no action-log entry (empty logEntries) — same treatment as
// the sibling reset command.
export const rebuildIndexCommand: Command<void, RebuildStats> = {
  async execute(ctx) {
    const result = await ctx.storageService.index.rebuild(ctx.projectContext);
    return { result, logEntries: [] };
  },
};
