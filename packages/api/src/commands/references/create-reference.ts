import type { Reference } from "@maskor/shared";
import type { Command } from "../types";

export const createReferenceCommand: Command<Reference, Reference> = {
  async execute(ctx, input) {
    await ctx.storageService.references.write(ctx.projectContext, input);
    return {
      result: input,
      logEntries: [
        {
          type: "reference:created" as const,
          actor: ctx.actor,
          target: { type: "reference" as const, uuid: input.uuid, key: input.key },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
