import { slugify, type DraftManifest } from "@maskor/shared";
import type { Command } from "../types";

export type DeleteDraftInput = {
  draftUuid: string;
};

export const deleteDraftCommand: Command<DeleteDraftInput, DraftManifest> = {
  async execute(ctx, input) {
    const deleted = await ctx.storageService.drafts.delete(ctx.projectContext, input.draftUuid);
    return {
      result: deleted,
      logEntries: [
        {
          type: "draft:deleted" as const,
          actor: ctx.actor,
          target: {
            type: "draft" as const,
            uuid: deleted.uuid,
            key: slugify(deleted.name),
            title: deleted.name,
          },
          payload: { name: deleted.name },
          undoable: false,
        },
      ],
    };
  },
};
