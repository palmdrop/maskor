import type { Fragment } from "@maskor/shared";
import type { Command } from "../types";

export type ExtractFragmentInput = {
  newFragment: Fragment;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut" | "link";
  navigated: boolean;
};

export const extractFragmentCommand: Command<ExtractFragmentInput, Fragment> = {
  async execute(ctx, input) {
    const { newFragment, sourceType, sourceKey, sourceUuid, sourceMode, navigated } = input;
    const fragment = await ctx.storageService.fragments.write(ctx.projectContext, newFragment);
    return {
      result: fragment,
      logEntries: [
        {
          type: "fragment:extracted" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragment.uuid, key: fragment.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
