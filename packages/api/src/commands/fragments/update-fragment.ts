import type { Fragment, LogEntry } from "@maskor/shared";
import type { Command } from "../types";
import { aspectWeightsEqual, stringArraysEqual } from "../split-update";

type UpdateFragmentInput = {
  existing: Fragment;
  patch: {
    key?: string;
    content?: string;
    readyStatus?: number;
    notes?: string[];
    references?: string[];
    aspects?: Record<string, { weight: number }>;
  };
};

type FragmentChangedField = "content" | "readyStatus" | "aspects" | "notes" | "references";

const diffFragmentFields = (
  patch: UpdateFragmentInput["patch"],
  existing: Fragment,
): FragmentChangedField[] => {
  const changed: FragmentChangedField[] = [];
  if (patch.content !== undefined && patch.content !== existing.content) changed.push("content");
  if (patch.readyStatus !== undefined && patch.readyStatus !== existing.readyStatus)
    changed.push("readyStatus");
  if (patch.notes !== undefined && !stringArraysEqual(patch.notes, existing.notes))
    changed.push("notes");
  if (patch.references !== undefined && !stringArraysEqual(patch.references, existing.references))
    changed.push("references");
  if (patch.aspects !== undefined && !aspectWeightsEqual(patch.aspects, existing.aspects))
    changed.push("aspects");
  return changed;
};

export const updateFragmentCommand: Command<UpdateFragmentInput, Fragment> = {
  async execute(ctx, { existing, patch }) {
    const keyChanged = patch.key !== undefined && patch.key !== existing.key;
    const changedFields = diffFragmentFields(patch, existing);

    if (!keyChanged && changedFields.length === 0) {
      return { result: existing, logEntries: [] };
    }

    const fragment = await ctx.storageService.fragments.write(ctx.projectContext, {
      ...existing,
      ...patch,
    });

    if (changedFields.length > 0) {
      ctx.storageService.suggestion.recordEditSaved(ctx.projectContext, existing.uuid);
    }

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [];

    if (keyChanged) {
      logEntries.push({
        type: "fragment:renamed",
        actor: ctx.actor,
        target: { type: "fragment", uuid: existing.uuid, key: existing.key },
        payload: { oldKey: existing.key, newKey: patch.key! },
        undoable: true,
      });
    }

    if (changedFields.length > 0) {
      logEntries.push({
        type: "fragment:updated",
        actor: ctx.actor,
        target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
        payload: { changedFields },
        undoable: true,
      });
    }

    return { result: fragment, logEntries };
  },
};
