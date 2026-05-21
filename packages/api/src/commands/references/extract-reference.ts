import type { Reference } from "@maskor/shared";
import type { Command } from "../types";

export type ExtractReferenceInput = {
  newReference: Reference;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut" | "link";
  navigated: boolean;
};

export const extractReferenceCommand: Command<ExtractReferenceInput, Reference> = {
  async execute(ctx, input) {
    const { newReference, sourceType, sourceKey, sourceUuid, sourceMode, navigated } = input;
    await ctx.storageService.references.write(ctx.projectContext, newReference);
    return {
      result: newReference,
      logEntries: [
        {
          type: "reference:extracted" as const,
          actor: ctx.actor,
          target: { type: "reference" as const, uuid: newReference.uuid, key: newReference.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
