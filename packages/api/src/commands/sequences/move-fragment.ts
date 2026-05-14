import { moveFragment } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type MoveFragmentInput = {
  sequenceId: string;
  fragmentUuid: string;
  sectionUuid: string;
  position: number;
};

export const moveFragmentCommand: Command<MoveFragmentInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, fragmentUuid, sectionUuid, position }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = moveFragment(indexed, fragmentUuid, sectionUuid, position);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:fragment-moved" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
