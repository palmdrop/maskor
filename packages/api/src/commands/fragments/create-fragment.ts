import type { Fragment } from "@maskor/shared";
import type { Command } from "../types";

export const createFragmentCommand: Command<Fragment, Fragment> = {
  async execute(ctx, input) {
    const fragment = await ctx.storageService.fragments.write(ctx.projectContext, input, {
      contentChanged: true,
    });
    return {
      result: fragment,
      logEntries: [
        {
          type: "fragment:created" as const,
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragment.uuid, key: fragment.key },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
