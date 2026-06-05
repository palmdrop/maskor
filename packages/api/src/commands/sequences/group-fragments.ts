import { groupFragmentsIntoSection } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type GroupFragmentsInput = {
  sequenceId: string;
  fragmentUuids: string[];
  sectionName: string;
  sequenceName: string;
};

export const groupFragmentsCommand: Command<GroupFragmentsInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, fragmentUuids, sectionName, sequenceName }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = groupFragmentsIntoSection(indexed, fragmentUuids, sectionName);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:fragments-grouped" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { sectionName, fragmentCount: fragmentUuids.length },
          undoable: true,
        },
      ],
    };
  },
};
