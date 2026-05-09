import type { Command } from "../types";

type DeleteAspectInput = { aspectId: string; aspectKey: string };

export const deleteAspectCommand: Command<DeleteAspectInput, void> = {
  async execute(ctx, { aspectId, aspectKey }) {
    await ctx.storageService.aspects.delete(ctx.projectContext, aspectId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "aspect:deleted" as const,
          actor: ctx.actor,
          target: { type: "aspect" as const, uuid: aspectId, key: aspectKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
