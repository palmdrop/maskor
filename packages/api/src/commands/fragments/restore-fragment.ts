import type { Command } from "../types";

type RestoreFragmentInput = { fragmentId: string; fragmentKey: string };

export const restoreFragmentCommand: Command<RestoreFragmentInput, void> = {
  async execute(ctx, { fragmentId, fragmentKey }) {
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
