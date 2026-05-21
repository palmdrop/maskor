import type { Aspect } from "@maskor/shared";
import type { Command } from "../types";

export type ExtractAspectInput = {
  newAspect: Aspect;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep";
  navigated: boolean;
};

export const extractAspectCommand: Command<ExtractAspectInput, Aspect> = {
  async execute(ctx, input) {
    const { newAspect, sourceType, sourceKey, sourceUuid, sourceMode, navigated } = input;
    await ctx.storageService.aspects.write(ctx.projectContext, newAspect);
    return {
      result: newAspect,
      logEntries: [
        {
          type: "aspect:extracted" as const,
          actor: ctx.actor,
          target: { type: "aspect" as const, uuid: newAspect.uuid, key: newAspect.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
