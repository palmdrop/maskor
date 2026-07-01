import type { Fragment, FragmentLanguageCode, LogEntry } from "@maskor/shared";
import type { Command } from "../types";
import {
  diffAspectWeights,
  diffStringSet,
  stringArraysEqual,
  aspectWeightsEqual,
} from "../split-update";

export type UpdateSource = "user-content-save" | "user-metadata" | "programmatic";

type UpdateFragmentInput = {
  existing: Fragment;
  patch: {
    key?: string;
    content?: string;
    readiness?: number;
    references?: string[];
    aspects?: Record<string, { weight: number }>;
    // `null` clears the override (inherit project language); a code sets it; absent leaves it unchanged.
    language?: FragmentLanguageCode | null;
  };
  source?: UpdateSource;
};

export const updateFragmentCommand: Command<UpdateFragmentInput, Fragment> = {
  async execute(ctx, { existing, patch, source = "programmatic" }) {
    const keyChanged = patch.key !== undefined && patch.key !== existing.key;

    const contentChanged = patch.content !== undefined && patch.content !== existing.content;
    const readinessChanged =
      patch.readiness !== undefined && patch.readiness !== existing.readiness;
    const referencesChanged =
      patch.references !== undefined && !stringArraysEqual(patch.references, existing.references);
    const aspectsChanged =
      patch.aspects !== undefined && !aspectWeightsEqual(patch.aspects, existing.aspects);
    // Normalize the override to the domain shape (no `null`): `null` clears back to inherit (undefined).
    const nextLanguage = patch.language === null ? undefined : patch.language;
    const languageChanged = patch.language !== undefined && nextLanguage !== existing.language;

    const anyNonKeyChanged =
      contentChanged || readinessChanged || referencesChanged || aspectsChanged || languageChanged;

    if (!keyChanged && !anyNonKeyChanged) {
      return { result: existing, logEntries: [] };
    }

    const fragment = await ctx.storageService.fragments.write(
      ctx.projectContext,
      { ...existing, ...patch, language: languageChanged ? nextLanguage : existing.language },
      { contentChanged },
    );

    if (anyNonKeyChanged) {
      ctx.storageService.suggestion.recordEditSaved(ctx.projectContext, existing.uuid);
    }

    const logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[] = [];

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

    if (readinessChanged) {
      logEntries.push({
        type: "fragment:readiness-changed",
        actor: ctx.actor,
        target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
        payload: { from: existing.readiness, to: patch.readiness! },
        undoable: true,
      });
    }

    if (languageChanged) {
      // No dedicated single-intent type for the language override; route through the generic catch-all.
      logEntries.push({
        type: "fragment:updated",
        actor: ctx.actor,
        target: { type: "fragment", uuid: existing.uuid, key: patch.key ?? existing.key },
        payload: { changedFields: ["language"] },
        undoable: true,
      });
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
      const { added, removed, weightChanged } = diffAspectWeights(existing.aspects, patch.aspects!);
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
