import { insertSequenceIntoSequence } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type InsertSequenceInput = {
  targetSequenceId: string;
  sourceSequenceId: string;
  sectionIndex: number;
};

export const insertSequenceCommand: Command<InsertSequenceInput, IndexedSequence> = {
  async execute(ctx, { targetSequenceId, sourceSequenceId, sectionIndex }) {
    const [target, source] = await Promise.all([
      ctx.storageService.sequences.read(ctx.projectContext, targetSequenceId),
      ctx.storageService.sequences.read(ctx.projectContext, sourceSequenceId),
    ]);
    const updated = insertSequenceIntoSequence(target, source, sectionIndex);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, targetSequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:inserted" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: targetSequenceId, title: target.name },
          payload: { sourceName: source.name, sectionCount: source.sections.length },
          undoable: true,
        },
      ],
    };
  },
};
