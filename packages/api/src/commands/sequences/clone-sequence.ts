import { cloneSequence } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type CloneSequenceInput = {
  sequenceId: string;
  name: string;
};

export const cloneSequenceCommand: Command<CloneSequenceInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, name }) {
    const source = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const clone = cloneSequence(source, name);
    await ctx.storageService.sequences.write(ctx.projectContext, clone);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, clone.uuid);

    return {
      result,
      logEntries: [
        {
          type: "sequence:cloned" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: clone.uuid, title: name },
          payload: { sourceName: source.name },
          undoable: false,
        },
      ],
    };
  },
};
