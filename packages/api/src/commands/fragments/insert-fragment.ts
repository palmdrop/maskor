import type { Fragment } from "@maskor/shared";
import type { Command } from "../types";
import { applyInsertion, type InsertionPosition } from "../../helpers/apply-insertion";

export type InsertFragmentInput = {
  fragmentId: string;
  insertedBody: string;
  position: InsertionPosition;
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceKey: string;
  sourceUuid: string;
  sourceMode: "keep" | "cut";
  navigated: boolean;
};

export const insertFragmentCommand: Command<InsertFragmentInput, Fragment> = {
  async execute(
    ctx,
    {
      fragmentId,
      insertedBody,
      position,
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    },
  ) {
    const existing = await ctx.storageService.fragments.read(ctx.projectContext, fragmentId);
    const newContent = applyInsertion(existing.content, insertedBody, position);
    const updated = await ctx.storageService.fragments.write(
      ctx.projectContext,
      { ...existing, content: newContent },
      { contentChanged: true },
    );
    return {
      result: updated,
      logEntries: [
        {
          type: position === "append" ? "fragment:appended" : "fragment:prepended",
          actor: ctx.actor,
          target: { type: "fragment" as const, uuid: fragmentId, key: existing.key },
          payload: { sourceType, sourceKey, sourceUuid, sourceMode, navigated },
          undoable: false,
        },
      ],
    };
  },
};
