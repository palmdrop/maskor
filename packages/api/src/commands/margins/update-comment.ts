import type { Margin } from "@maskor/shared";
import type { Command } from "../types";

export type UpdateCommentInput = {
  fragmentUuid: string;
  markerId: string;
  patch: { excerpt?: string; body?: string };
};

// Update an existing comment's excerpt and/or body.
export const updateCommentCommand: Command<UpdateCommentInput, Margin> = {
  async execute(ctx, input) {
    const margin = await ctx.storageService.margins.updateComment(
      ctx.projectContext,
      input.fragmentUuid,
      input.markerId,
      input.patch,
    );
    return {
      result: margin,
      logEntries: [
        {
          type: "comment:updated" as const,
          actor: ctx.actor,
          target: { type: "margin" as const, uuid: margin.fragmentUuid, key: margin.fragmentKey },
          payload: { markerId: input.markerId },
          undoable: true,
        },
      ],
    };
  },
};
