import type { Command } from "../types";

type DesignateSequenceMainInput = { sequenceId: string };

export const designateSequenceMainCommand: Command<DesignateSequenceMainInput, void> = {
  async execute(ctx, { sequenceId }) {
    await ctx.storageService.sequences.setMain(ctx.projectContext, sequenceId);

    return {
      result: undefined,
      logEntries: [
        {
          type: "sequence:set-main" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
