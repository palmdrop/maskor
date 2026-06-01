import type { Comment, Margin } from "@maskor/shared";
import type { Command } from "../types";

export type CreateCommentInput = {
  fragmentUuid: string;
  comment: Comment;
};

// Append (or replace by markerId) a comment in a fragment's Margin, lazily creating the Margin.
export const createCommentCommand: Command<CreateCommentInput, Margin> = {
  async execute(ctx, input) {
    const margin = await ctx.storageService.margins.createComment(
      ctx.projectContext,
      input.fragmentUuid,
      input.comment,
    );
    return {
      result: margin,
      logEntries: [
        {
          type: "comment:created" as const,
          actor: ctx.actor,
          target: { type: "margin" as const, uuid: margin.fragmentUuid, key: margin.fragmentKey },
          payload: { markerId: input.comment.markerId },
          undoable: true,
        },
      ],
    };
  },
};
