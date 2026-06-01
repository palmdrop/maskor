import type { Command } from "../types";
import type { RebuildStats } from "@maskor/storage";

// Manual, on-demand hard reset: drops the vault DB and re-derives it from the vault. Used when the
// DB is broken in a way rebuild cannot fix (schema drift, half-failed migration, corrupt file).
// A re-derivation/maintenance operation rather than a content mutation, so it emits no action-log
// entry (empty logEntries) — the destructive loss of DB-only state is surfaced in the UI confirm
// dialog, not the action log.
export const resetDatabaseCommand: Command<void, RebuildStats> = {
  async execute(ctx) {
    const result = await ctx.storageService.index.reset(ctx.projectContext);
    return { result, logEntries: [] };
  },
};
