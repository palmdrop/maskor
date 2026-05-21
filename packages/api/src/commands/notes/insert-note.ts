import type { Note } from "@maskor/shared";
import type { Command } from "../types";
import { applyInsertion, type InsertionPosition } from "../../helpers/apply-insertion";

export type InsertNoteInput = {
  noteId: string;
  insertedBody: string;
  position: InsertionPosition;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut";
  navigated: boolean;
};

export const insertNoteCommand: Command<InsertNoteInput, Note> = {
  async execute(
    ctx,
    { noteId, insertedBody, position, sourceType, sourceKey, sourceUuid, sourceMode, navigated },
  ) {
    const existing = await ctx.storageService.notes.read(ctx.projectContext, noteId);
    const newContent = applyInsertion(existing.content, insertedBody, position);
    const { note: updated } = await ctx.storageService.notes.update(ctx.projectContext, noteId, {
      content: newContent,
    });
    return {
      result: updated,
      logEntries: [
        {
          type: position === "append" ? "note:appended" : "note:prepended",
          actor: ctx.actor,
          target: { type: "note" as const, uuid: noteId, key: existing.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
