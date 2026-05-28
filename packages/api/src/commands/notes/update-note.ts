import type { LogEntry, NoteUpdate, NoteUpdateResponse } from "@maskor/shared";
import type { Command } from "../types";
import type { UpdateSource } from "../fragments/update-fragment";

type UpdateNoteInput = { noteId: string; patch: NoteUpdate; source?: UpdateSource };

export const updateNoteCommand: Command<UpdateNoteInput, NoteUpdateResponse> = {
  async execute(ctx, { noteId, patch, source = "programmatic" }) {
    const existing = await ctx.storageService.notes.read(ctx.projectContext, noteId);

    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const contentChanged = patch.content !== undefined && patch.content !== existing.content;
    const resolvedCategory = patch.category ?? undefined;
    const categoryChanged = patch.category !== undefined && resolvedCategory !== existing.category;

    if (!keyChanged && !contentChanged && !categoryChanged) {
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

    if (categoryChanged) {
      logEntries.push({
        type: "note:category-changed",
        actor: ctx.actor,
        target: { type: "note", uuid: noteId, key: updateResult.note.key },
        payload: { from: existing.category, to: resolvedCategory },
        undoable: true,
      });
    }

    if (contentChanged) {
      if (source === "user-content-save") {
        logEntries.push({
          type: "note:edited",
          actor: ctx.actor,
          target: { type: "note", uuid: noteId, key: updateResult.note.key },
          payload: {},
          undoable: true,
        });
      } else {
        logEntries.push({
          type: "note:updated",
          actor: ctx.actor,
          target: { type: "note", uuid: noteId, key: updateResult.note.key },
          payload: { changedFields: ["content"] },
          undoable: true,
        });
      }
    }

    return { result: updateResult, logEntries };
  },
};
