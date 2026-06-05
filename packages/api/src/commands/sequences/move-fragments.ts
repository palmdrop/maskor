import { moveFragmentsToSection } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type MoveFragmentsInput = {
  sequenceId: string;
  fragmentUuids: string[];
  sectionUuid: string;
  position: number;
  sequenceName: string;
  sectionName: string;
};

export const moveFragmentsCommand: Command<MoveFragmentsInput, IndexedSequence> = {
  async execute(
    ctx,
    { sequenceId, fragmentUuids, sectionUuid, position, sequenceName, sectionName },
  ) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = moveFragmentsToSection(indexed, fragmentUuids, sectionUuid, position);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:fragments-moved" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { sectionName, fragmentCount: fragmentUuids.length },
          undoable: true,
        },
      ],
    };
  },
};
