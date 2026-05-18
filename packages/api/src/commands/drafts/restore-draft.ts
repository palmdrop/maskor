import { slugify } from "@maskor/shared";
import type { Command } from "../types";

export type RestoreDraftInput = {
  draftUuid: string;
  saveCurrentFirst: boolean;
  preRestoreName?: string;
};

export type RestoreDraftResult = {
  restoredDraftUuid: string;
  preRestoreDraftUuid?: string;
};

const defaultPreRestoreName = (): string => `Pre-restore — ${new Date().toISOString()}`;

export const restoreDraftCommand: Command<RestoreDraftInput, RestoreDraftResult> = {
  async execute(ctx, input) {
    const logEntries: Awaited<ReturnType<Command<RestoreDraftInput, RestoreDraftResult>["execute"]>>["logEntries"] = [];
    let preRestoreDraftUuid: string | undefined;

    // Spec § Restoring a draft: when the "save current state" checkbox is on,
    // run a regular create first. If it fails, the restore is aborted before
    // any live file is touched.
    if (input.saveCurrentFirst) {
      const name = input.preRestoreName?.trim() ? input.preRestoreName.trim() : defaultPreRestoreName();
      const preDraft = await ctx.storageService.drafts.create(ctx.projectContext, { name });
      preRestoreDraftUuid = preDraft.uuid;
      logEntries.push({
        type: "draft:created" as const,
        actor: ctx.actor,
        target: {
          type: "draft" as const,
          uuid: preDraft.uuid,
          key: slugify(preDraft.name),
          title: preDraft.name,
        },
        payload: { name: preDraft.name },
        undoable: false,
      });
    }

    const restored = await ctx.storageService.drafts.restore(ctx.projectContext, input.draftUuid);
    logEntries.push({
      type: "draft:restored" as const,
      actor: ctx.actor,
      target: {
        type: "draft" as const,
        uuid: restored.uuid,
        key: slugify(restored.name),
        title: restored.name,
      },
      payload: {
        name: restored.name,
        ...(preRestoreDraftUuid ? { preRestoreDraftUuid } : {}),
      },
      undoable: false,
    });

    return {
      result: {
        restoredDraftUuid: restored.uuid,
        ...(preRestoreDraftUuid ? { preRestoreDraftUuid } : {}),
      },
      logEntries,
    };
  },
};
