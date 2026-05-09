import type { Command } from "../types";

type DeleteReferenceInput = { referenceId: string; referenceKey: string };

export const deleteReferenceCommand: Command<DeleteReferenceInput, void> = {
  async execute(ctx, { referenceId, referenceKey }) {
    await ctx.storageService.references.delete(ctx.projectContext, referenceId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "reference:deleted" as const,
          actor: ctx.actor,
          target: { type: "reference" as const, uuid: referenceId, key: referenceKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
