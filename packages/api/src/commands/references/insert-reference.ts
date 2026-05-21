import type { Reference } from "@maskor/shared";
import type { Command } from "../types";
import { applyInsertion, type InsertionPosition } from "../../helpers/apply-insertion";

export type InsertReferenceInput = {
  referenceId: string;
  insertedBody: string;
  position: InsertionPosition;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut";
  navigated: boolean;
};

export const insertReferenceCommand: Command<InsertReferenceInput, Reference> = {
  async execute(
    ctx,
    {
      referenceId,
      insertedBody,
      position,
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    },
  ) {
    const existing = await ctx.storageService.references.read(ctx.projectContext, referenceId);
    const newContent = applyInsertion(existing.content, insertedBody, position);
    const { reference: updated } = await ctx.storageService.references.update(
      ctx.projectContext,
      referenceId,
      { content: newContent },
    );
    return {
      result: updated,
      logEntries: [
        {
          type: (position === "append" ? "reference:appended" : "reference:prepended") as
            | "reference:appended"
            | "reference:prepended",
          actor: ctx.actor,
          target: { type: "reference" as const, uuid: referenceId, key: existing.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
