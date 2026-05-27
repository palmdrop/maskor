import type { AspectUpdate, AspectUpdateResponse, LogEntry } from "@maskor/shared";
import type { Command } from "../types";
import type { UpdateSource } from "../fragments/update-fragment";
import { diffStringSet, stringArraysEqual } from "../split-update";

type UpdateAspectInput = { aspectId: string; patch: AspectUpdate; source?: UpdateSource };

export const updateAspectCommand: Command<UpdateAspectInput, AspectUpdateResponse> = {
  async execute(ctx, { aspectId, patch, source = "programmatic" }) {
    const existing = await ctx.storageService.aspects.read(ctx.projectContext, aspectId);

    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const descriptionChanged =
      patch.description !== undefined && patch.description !== existing.description;
    const resolvedCategory = patch.category ?? undefined;
    const categoryChanged =
      patch.category !== undefined && resolvedCategory !== existing.category;
    const resolvedColor = patch.color ?? undefined;
    const colorChanged = patch.color !== undefined && resolvedColor !== existing.color;
    const notesChanged =
      patch.notes !== undefined && !stringArraysEqual(patch.notes, existing.notes);

    const anyNonKeyChanged =
      descriptionChanged || categoryChanged || colorChanged || notesChanged;

    if (!keyChanged && !anyNonKeyChanged) {
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

    if (descriptionChanged) {
      if (source === "user-content-save") {
        logEntries.push({
          type: "aspect:description-edited",
          actor: ctx.actor,
          target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
          payload: {},
          undoable: true,
        });
      } else {
        // Description has no programmatic single-intent type, so it routes to
        // the *:updated catch-all. Other fields with single-intent types
        // (category, notes) emit their own entries alongside.
        logEntries.push({
          type: "aspect:updated",
          actor: ctx.actor,
          target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
          payload: { changedFields: ["description"] },
          undoable: true,
        });
      }
    }

    if (categoryChanged) {
      logEntries.push({
        type: "aspect:category-changed",
        actor: ctx.actor,
        target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
        payload: { from: existing.category, to: resolvedCategory },
        undoable: true,
      });
    }

    if (colorChanged) {
      logEntries.push({
        type: "aspect:updated",
        actor: ctx.actor,
        target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
        payload: { changedFields: ["color"] },
        undoable: true,
      });
    }

    if (notesChanged) {
      const { added, removed } = diffStringSet(existing.notes, patch.notes!);
      for (const noteKey of added) {
        logEntries.push({
          type: "aspect:note-attached",
          actor: ctx.actor,
          target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
          payload: { noteKey },
          undoable: true,
        });
      }
      for (const noteKey of removed) {
        logEntries.push({
          type: "aspect:note-detached",
          actor: ctx.actor,
          target: { type: "aspect", uuid: aspectId, key: updateResult.aspect.key },
          payload: { noteKey },
          undoable: true,
        });
      }
    }

    return { result: updateResult, logEntries };
  },
};
