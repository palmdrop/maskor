import { createDefaultSequence } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

export const ensureMainSequenceCommand: Command<void, IndexedSequence> = {
  async execute(ctx) {
    const existing = await ctx.storageService.sequences.getMain(ctx.projectContext);
    if (existing) {
      return { result: existing, logEntries: [] };
    }

    const sequence = createDefaultSequence(ctx.projectContext.projectUUID, "Main Sequence");
    await ctx.storageService.sequences.write(ctx.projectContext, sequence);
    const created = await ctx.storageService.sequences.read(ctx.projectContext, sequence.uuid);

    return {
      result: created,
      logEntries: [
        {
          type: "sequence:created" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequence.uuid },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
