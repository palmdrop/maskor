import type { Aspect } from "@maskor/shared";
import type { Command } from "../types";
import { applyInsertion, type InsertionPosition } from "../../helpers/apply-insertion";

export type InsertAspectInput = {
  aspectId: string;
  insertedBody: string;
  position: InsertionPosition;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut";
  navigated: boolean;
};

export const insertAspectCommand: Command<InsertAspectInput, Aspect> = {
  async execute(
    ctx,
    { aspectId, insertedBody, position, sourceType, sourceKey, sourceUuid, sourceMode, navigated },
  ) {
    const existing = await ctx.storageService.aspects.read(ctx.projectContext, aspectId);
    const existingDescription = existing.description ?? "";
    const newDescription = applyInsertion(existingDescription, insertedBody, position);
    const { aspect: updated } = await ctx.storageService.aspects.update(
      ctx.projectContext,
      aspectId,
      { description: newDescription },
    );
    return {
      result: updated,
      logEntries: [
        {
          type: position === "append" ? "aspect:appended" : "aspect:prepended",
          actor: ctx.actor,
          target: { type: "aspect" as const, uuid: aspectId, key: existing.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
