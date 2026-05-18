import { computeViolations, detectCycles } from "@maskor/sequencer";
import type { Violation, Cycle } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type DesignateSequenceMainInput = { sequenceId: string };

export type SequenceBundledResponse = {
  sequences: IndexedSequence[];
  violations: Violation[];
  cycles: Cycle[];
};

export const designateSequenceMainCommand: Command<
  DesignateSequenceMainInput,
  SequenceBundledResponse
> = {
  async execute(ctx, { sequenceId }) {
    await ctx.storageService.sequences.setMain(ctx.projectContext, sequenceId);

    const allSequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
    const main = allSequences.find((s) => s.isMain) ?? null;
    const secondaries = allSequences.filter((s) => !s.isMain);

    const cycles = detectCycles(secondaries);
    const violations = main ? computeViolations(main, secondaries) : [];

    return {
      result: { sequences: allSequences, violations, cycles },
      logEntries: [
        {
          type: "sequence:set-main" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
