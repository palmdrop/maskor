import type { LogEntry } from "@maskor/shared";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";
import { resolveSequenceName } from "./create-sequence";

type UpdateSequenceInput = {
  sequenceId: string;
  patch: { name?: string; isMain?: boolean; active?: boolean };
};

export const updateSequenceCommand: Command<UpdateSequenceInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, patch }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[] = [];

    if (patch.isMain === true && !indexed.isMain) {
      await ctx.storageService.sequences.setMain(ctx.projectContext, sequenceId);
      logEntries.push({
        type: "sequence:set-main" as const,
        actor: ctx.actor,
        target: { type: "sequence" as const, uuid: sequenceId },
        payload: {},
        undoable: false,
      });
    }

    if (patch.name !== undefined && patch.name !== indexed.name) {
      const newName = resolveSequenceName(patch.name);
      const reread = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
      const updated = { ...reread, name: newName };
      await ctx.storageService.sequences.write(ctx.projectContext, updated);
      logEntries.push({
        type: "sequence:renamed" as const,
        actor: ctx.actor,
        target: { type: "sequence" as const, uuid: sequenceId },
        payload: { oldKey: indexed.name, newKey: newName },
        undoable: false,
      });
    }

    if (patch.active !== undefined && patch.active !== indexed.active) {
      const reread = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
      const updated = { ...reread, active: patch.active };
      await ctx.storageService.sequences.write(ctx.projectContext, updated);
      logEntries.push({
        type: patch.active ? ("sequence:activated" as const) : ("sequence:deactivated" as const),
        actor: ctx.actor,
        target: { type: "sequence" as const, uuid: sequenceId },
        payload: {},
        undoable: false,
      });
    }

    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    return { result, logEntries };
  },
};
