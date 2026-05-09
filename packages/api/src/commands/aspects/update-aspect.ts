import type { AspectUpdate, AspectUpdateResponse, LogEntry } from "@maskor/shared";
import type { Command } from "../types";
import { stringArraysEqual } from "../split-update";

type UpdateAspectInput = { aspectId: string; patch: AspectUpdate };

type AspectChangedField = "description" | "category" | "notes";

const diffAspectFields = (
  patch: AspectUpdate,
  existing: { description?: string; category?: string; notes: string[] },
): AspectChangedField[] => {
  const changed: AspectChangedField[] = [];
  if (patch.description !== undefined && patch.description !== existing.description)
    changed.push("description");
  if (patch.category !== undefined && patch.category !== existing.category)
    changed.push("category");
  if (patch.notes !== undefined && !stringArraysEqual(patch.notes, existing.notes))
    changed.push("notes");
  return changed;
};

export const updateAspectCommand: Command<UpdateAspectInput, AspectUpdateResponse> = {
  async execute(ctx, { aspectId, patch }) {
    const existing = await ctx.storageService.aspects.read(ctx.projectContext, aspectId);

    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const changedFields = diffAspectFields(patch, existing);

    if (!keyChanged && changedFields.length === 0) {
      return { result: { aspect: existing, warnings: [] }, logEntries: [] };
    }

    const updateResult = await ctx.storageService.aspects.update(
      ctx.projectContext,
      aspectId,
      patch,
    );

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [];

    if (keyChanged && patch.key) {
      logEntries.push({
        type: "aspect:renamed",
        actor: ctx.actor,
        target: { type: "aspect", uuid: aspectId, key: existing.key },
        payload: { oldKey: existing.key, newKey: patch.key },
        undoable: true,
      });
    }

    if (changedFields.length > 0) {
      logEntries.push({
        type: "aspect:updated",
        actor: ctx.actor,
        target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
        payload: { changedFields },
        undoable: true,
      });
    }

    return { result: updateResult, logEntries };
  },
};
