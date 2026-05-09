import type { Fragment, LogEntry } from "@maskor/shared";
import type { Command } from "../types";
import { diffAspectWeights, diffStringSet, stringArraysEqual, aspectWeightsEqual } from "../split-update";

export type UpdateSource = "user-content-save" | "user-metadata" | "programmatic";

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
  source?: UpdateSource;
};

export const updateFragmentCommand: Command<UpdateFragmentInput, Fragment> = {
  async execute(ctx, { existing, patch, source = "programmatic" }) {
    const keyChanged = patch.key !== undefined && patch.key !== existing.key;

    const contentChanged = patch.content !== undefined && patch.content !== existing.content;
    const readyStatusChanged =
      patch.readyStatus !== undefined && patch.readyStatus !== existing.readyStatus;
    const notesChanged =
      patch.notes !== undefined && !stringArraysEqual(patch.notes, existing.notes);
    const referencesChanged =
      patch.references !== undefined && !stringArraysEqual(patch.references, existing.references);
    const aspectsChanged =
      patch.aspects !== undefined && !aspectWeightsEqual(patch.aspects, existing.aspects);

    const anyNonKeyChanged =
      contentChanged ||
      readyStatusChanged ||
      notesChanged ||
      referencesChanged ||
      aspectsChanged;

    if (!keyChanged && !anyNonKeyChanged) {
      return { result: existing, logEntries: [] };
    }

    const fragment = await ctx.storageService.fragments.write(ctx.projectContext, {
      ...existing,
      ...patch,
    });

    if (anyNonKeyChanged) {
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

    if (contentChanged) {
      if (source === "user-content-save") {
        logEntries.push({
          type: "fragment:edited",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: {},
          undoable: true,
        });
      } else {
        // Content has no programmatic single-intent type, so it routes to the
        // *:updated catch-all. Other fields with single-intent types (ready
        // status, notes, references, aspects) emit their own entries alongside.
        logEntries.push({
          type: "fragment:updated",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { changedFields: ["content"] },
          undoable: true,
        });
      }
    }

    if (readyStatusChanged) {
      logEntries.push({
        type: "fragment:ready-status-changed",
        actor: ctx.actor,
        target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
        payload: { from: existing.readyStatus, to: patch.readyStatus! },
        undoable: true,
      });
    }

    if (notesChanged) {
      const { added, removed } = diffStringSet(existing.notes, patch.notes!);
      for (const noteKey of added) {
        logEntries.push({
          type: "fragment:note-attached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { noteKey },
          undoable: true,
        });
      }
      for (const noteKey of removed) {
        logEntries.push({
          type: "fragment:note-detached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { noteKey },
          undoable: true,
        });
      }
    }

    if (referencesChanged) {
      const { added, removed } = diffStringSet(existing.references, patch.references!);
      for (const referenceKey of added) {
        logEntries.push({
          type: "fragment:reference-attached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { referenceKey },
          undoable: true,
        });
      }
      for (const referenceKey of removed) {
        logEntries.push({
          type: "fragment:reference-detached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { referenceKey },
          undoable: true,
        });
      }
    }

    if (aspectsChanged) {
      const { added, removed, weightChanged } = diffAspectWeights(
        existing.aspects,
        patch.aspects!,
      );
      for (const { key: aspectKey, weight } of added) {
        logEntries.push({
          type: "fragment:aspect-attached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { aspectKey, weight },
          undoable: true,
        });
      }
      for (const aspectKey of removed) {
        logEntries.push({
          type: "fragment:aspect-detached",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { aspectKey },
          undoable: true,
        });
      }
      for (const { key: aspectKey, from, to } of weightChanged) {
        logEntries.push({
          type: "fragment:aspect-weight-changed",
          actor: ctx.actor,
          target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
          payload: { aspectKey, from, to },
          undoable: true,
        });
      }
    }

    return { result: fragment, logEntries };
  },
};
