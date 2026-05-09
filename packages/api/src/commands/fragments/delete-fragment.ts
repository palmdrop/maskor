import type { Command } from "../types";

type DeleteFragmentInput = { fragmentId: string; fragmentKey: string };

export const deleteFragmentCommand: Command<DeleteFragmentInput, void> = {
  async execute(ctx, { fragmentId, fragmentKey }) {
    await ctx.storageService.fragments.delete(ctx.projectContext, fragmentId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "fragment:deleted" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragmentId, key: fragmentKey },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
