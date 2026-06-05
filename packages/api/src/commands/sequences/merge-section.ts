import { mergeSectionWithNext } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type MergeSectionInput = {
  sequenceId: string;
  sectionId: string;
  sequenceName: string;
  sectionName: string;
};

export const mergeSectionCommand: Command<MergeSectionInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, sectionId, sequenceName, sectionName }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = mergeSectionWithNext(indexed, sectionId);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:sections-merged" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { sectionName },
          undoable: true,
        },
      ],
    };
  },
};
