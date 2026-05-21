import type { Note } from "@maskor/shared";
import type { Command } from "../types";

export type ExtractNoteInput = {
  newNote: Note;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut" | "link";
  navigated: boolean;
};

export const extractNoteCommand: Command<ExtractNoteInput, Note> = {
  async execute(ctx, input) {
    const { newNote, sourceType, sourceKey, sourceUuid, sourceMode, navigated } = input;
    await ctx.storageService.notes.write(ctx.projectContext, newNote);
    return {
      result: newNote,
      logEntries: [
        {
          type: "note:extracted" as const,
          actor: ctx.actor,
          target: { type: "note" as const, uuid: newNote.uuid, key: newNote.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
