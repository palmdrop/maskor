import type { LogEntry, ReferenceUpdate, ReferenceUpdateResponse } from "@maskor/shared";
import type { Command } from "../types";
import type { UpdateSource } from "../fragments/update-fragment";

type UpdateReferenceInput = { referenceId: string; patch: ReferenceUpdate; source?: UpdateSource };

export const updateReferenceCommand: Command<UpdateReferenceInput, ReferenceUpdateResponse> = {
  async execute(ctx, { referenceId, patch, source = "programmatic" }) {
    const existing = await ctx.storageService.references.read(ctx.projectContext, referenceId);

    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const contentChanged = patch.content !== undefined && patch.content !== existing.content;
    const resolvedCategory = patch.category ?? undefined;
    const categoryChanged =
      patch.category !== undefined && resolvedCategory !== existing.category;

    if (!keyChanged && !contentChanged && !categoryChanged) {
      return {
        result: { reference: existing, warnings: { fragments: [] } },
        logEntries: [],
      };
    }

    const updateResult = await ctx.storageService.references.update(
      ctx.projectContext,
      referenceId,
      patch,
    );

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [];

    if (keyChanged && patch.key) {
      logEntries.push({
        type: "reference:renamed",
        actor: ctx.actor,
        target: { type: "reference", uuid: referenceId, key: existing.key },
        payload: { oldKey: existing.key, newKey: patch.key },
        undoable: true,
      });
    }

    if (categoryChanged) {
      logEntries.push({
        type: "reference:category-changed",
        actor: ctx.actor,
        target: { type: "reference", uuid: referenceId, key: updateResult.reference.key },
        payload: { from: existing.category, to: resolvedCategory },
        undoable: true,
      });
    }

    if (contentChanged) {
      if (source === "user-content-save") {
        logEntries.push({
          type: "reference:edited",
          actor: ctx.actor,
          target: { type: "reference", uuid: referenceId, key: updateResult.reference.key },
          payload: {},
          undoable: true,
        });
      } else {
        logEntries.push({
          type: "reference:updated",
          actor: ctx.actor,
          target: { type: "reference", uuid: referenceId, key: updateResult.reference.key },
          payload: { changedFields: ["content"] },
          undoable: true,
        });
      }
    }

    return { result: updateResult, logEntries };
  },
};
