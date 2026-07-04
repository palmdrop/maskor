import type { Command } from "../types";

type RestoreFragmentInput = { fragmentId: string; fragmentKey: string };

export const restoreFragmentCommand: Command<RestoreFragmentInput, void> = {
  async execute(ctx, { fragmentId, fragmentKey }) {
    // Restore does NOT re-place the fragment into the sequences discard removed it
    // from: it returns to the unassigned pool. The former placements are not
    // tracked (discard is not a reversible move of sequence structure), and the
    // user re-places deliberately if they want it back in a sequence.
    await ctx.storageService.fragments.restore(ctx.projectContext, fragmentId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "fragment:restored" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragmentId, key: fragmentKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
