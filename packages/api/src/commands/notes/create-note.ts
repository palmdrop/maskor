import type { Note } from "@maskor/shared";
import type { Command } from "../types";

export const createNoteCommand: Command<Note, Note> = {
  async execute(ctx, input) {
    await ctx.storageService.notes.write(ctx.projectContext, input);
    return {
      result: input,
      logEntries: [
        {
          type: "note:created" as const,
          actor: ctx.actor,
          target: { type: "note" as const, uuid: input.uuid, key: input.key },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
