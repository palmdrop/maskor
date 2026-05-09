import type { LogEntry, NoteUpdate, NoteUpdateResponse } from "@maskor/shared";
import type { Command } from "../types";

type UpdateNoteInput = { noteId: string; patch: NoteUpdate };

export const updateNoteCommand: Command<UpdateNoteInput, NoteUpdateResponse> = {
  async execute(ctx, { noteId, patch }) {
    const existing = await ctx.storageService.notes.read(ctx.projectContext, noteId);

    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const contentChanged = patch.content !== undefined && patch.content !== existing.content;

    if (!keyChanged && !contentChanged) {
      return {
        result: { note: existing, warnings: { fragments: [], aspects: [] } },
        logEntries: [],
      };
    }

    const updateResult = await ctx.storageService.notes.update(ctx.projectContext, noteId, patch);

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [];

    if (keyChanged && patch.key) {
      logEntries.push({
        type: "note:renamed",
        actor: ctx.actor,
        target: { type: "note", uuid: noteId, key: existing.key },
        payload: { oldKey: existing.key, newKey: patch.key },
        undoable: true,
      });
    }

    if (contentChanged) {
      logEntries.push({
        type: "note:updated",
        actor: ctx.actor,
        target: { type: "note", uuid: noteId, key: updateResult.note.key },
        payload: { changedFields: ["content"] },
        undoable: true,
      });
    }

    return { result: updateResult, logEntries };
  },
};
