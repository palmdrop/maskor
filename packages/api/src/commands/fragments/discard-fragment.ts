import type { Command } from "../types";

type DiscardFragmentInput = { fragmentId: string; fragmentKey: string };

export const discardFragmentCommand: Command<DiscardFragmentInput, void> = {
  async execute(ctx, { fragmentId, fragmentKey }) {
    await ctx.storageService.fragments.discard(ctx.projectContext, fragmentId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "fragment:discarded" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragmentId, key: fragmentKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
