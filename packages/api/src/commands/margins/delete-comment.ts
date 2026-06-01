import type { Margin } from "@maskor/shared";
import type { Command } from "../types";

export type DeleteCommentInput = {
  fragmentUuid: string;
  markerId: string;
};

// Remove a comment from a fragment's Margin (the only way an orphaned comment is removed).
export const deleteCommentCommand: Command<DeleteCommentInput, Margin> = {
  async execute(ctx, input) {
    const margin = await ctx.storageService.margins.deleteComment(
      ctx.projectContext,
      input.fragmentUuid,
      input.markerId,
    );
    return {
      result: margin,
      logEntries: [
        {
          type: "comment:deleted" as const,
          actor: ctx.actor,
          target: { type: "margin" as const, uuid: margin.fragmentUuid, key: margin.fragmentKey },
          payload: { markerId: input.markerId },
          undoable: true,
        },
      ],
    };
  },
};
