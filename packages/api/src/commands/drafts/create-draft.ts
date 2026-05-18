import { slugify, type DraftManifest } from "@maskor/shared";
import type { Command } from "../types";

export type CreateDraftInput = {
  name: string;
  note?: string;
};

export const createDraftCommand: Command<CreateDraftInput, DraftManifest> = {
  async execute(ctx, input) {
    const draft = await ctx.storageService.drafts.create(ctx.projectContext, {
      name: input.name,
      note: input.note,
    });

    return {
      result: draft,
      logEntries: [
        {
          type: "draft:created" as const,
          actor: ctx.actor,
          target: {
            type: "draft" as const,
            uuid: draft.uuid,
            key: slugify(draft.name),
            title: draft.name,
          },
          payload: { name: draft.name, ...(draft.note ? { note: draft.note } : {}) },
          undoable: false,
        },
      ],
    };
  },
};
