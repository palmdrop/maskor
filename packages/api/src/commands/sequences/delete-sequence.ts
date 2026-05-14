import { VaultError } from "@maskor/storage";
import type { Command } from "../types";

type DeleteSequenceInput = { sequenceId: string };

export const deleteSequenceCommand: Command<DeleteSequenceInput, void> = {
  async execute(ctx, { sequenceId }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    if (indexed.isMain) {
      throw new VaultError(
        "KEY_CONFLICT",
        "Cannot delete the main sequence. Promote another sequence to main first.",
        { reason: "cannot_delete_main" },
      );
    }

    await ctx.storageService.sequences.delete(ctx.projectContext, sequenceId);

    return {
      result: undefined,
      logEntries: [
        {
          type: "sequence:deleted" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
