import { unplaceFragment } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type UnplaceFragmentInput = {
  sequenceId: string;
  fragmentUuid: string;
};

export const unplaceFragmentCommand: Command<UnplaceFragmentInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, fragmentUuid }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    const updated = unplaceFragment(indexed, fragmentUuid);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:fragment-unplaced" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
