import type { Aspect } from "@maskor/shared";
import type { Command } from "../types";

export const createAspectCommand: Command<Aspect, Aspect> = {
  async execute(ctx, input) {
    await ctx.storageService.aspects.write(ctx.projectContext, input);
    return {
      result: input,
      logEntries: [
        {
          type: "aspect:created" as const,
          actor: ctx.actor,
          target: { type: "aspect" as const, uuid: input.uuid, key: input.key },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
