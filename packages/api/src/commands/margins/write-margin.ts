import type { Comment, Margin } from "@maskor/shared";
import type { Command } from "../types";

export type WriteMarginInput = {
  fragmentUuid: string;
  notes: string;
  comments: Comment[];
};

// Replace a fragment's Margin (notes + comments). Lazily creates the Margin file on first write.
export const writeMarginCommand: Command<WriteMarginInput, Margin> = {
  async execute(ctx, input) {
    const margin = await ctx.storageService.margins.write(ctx.projectContext, input.fragmentUuid, {
      notes: input.notes,
      comments: input.comments,
    });
    return {
      result: margin,
      logEntries: [
        {
          type: "margin:updated" as const,
          actor: ctx.actor,
          target: { type: "margin" as const, uuid: margin.fragmentUuid, key: margin.fragmentKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
