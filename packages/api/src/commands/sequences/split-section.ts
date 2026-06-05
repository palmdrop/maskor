import { splitSectionAtFragment } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type SplitSectionInput = {
  sequenceId: string;
  fragmentUuid: string;
  sectionName: string;
  sequenceName: string;
};

export const splitSectionCommand: Command<SplitSectionInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, fragmentUuid, sectionName, sequenceName }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = splitSectionAtFragment(indexed, fragmentUuid, sectionName);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:section-split" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { sectionName },
          undoable: true,
        },
      ],
    };
  },
};
