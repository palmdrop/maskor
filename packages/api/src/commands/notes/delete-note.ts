import type { Command } from "../types";

type DeleteNoteInput = { noteId: string; noteKey: string };

export const deleteNoteCommand: Command<DeleteNoteInput, void> = {
  async execute(ctx, { noteId, noteKey }) {
    await ctx.storageService.notes.delete(ctx.projectContext, noteId);
    return {
      result: undefined,
      logEntries: [
        {
          type: "note:deleted" as const,
          actor: ctx.actor,
          target: { type: "note" as const, uuid: noteId, key: noteKey },
          payload: {},
          undoable: true,
        },
      ],
    };
  },
};
