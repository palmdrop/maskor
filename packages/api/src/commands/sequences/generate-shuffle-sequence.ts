import { createSeededRandom, randomSeed } from "@maskor/shared";
import { generateShuffledSequence } from "@maskor/sequencer";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type GenerateShuffleInput = {
  name?: string;
  constraintSequenceIds: string[];
};

// Pick a default name for a generated sequence that does not collide with the
// existing "Shuffle N" names in the project.
const nextShuffleName = (existingNames: string[]): string => {
  let highest = 0;
  for (const name of existingNames) {
    const match = /^Shuffle (\d+)$/.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Shuffle ${highest + 1}`;
};

export const generateShuffleSequenceCommand: Command<GenerateShuffleInput, IndexedSequence> = {
  async execute(ctx, { name, constraintSequenceIds }) {
    // The universe: every non-discarded fragment. Discarded fragments are not
    // placeable, so they never enter a generated arrangement.
    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const fragmentUuids = summaries
      .filter((fragment) => !fragment.isDiscarded)
      .map((fragment) => fragment.uuid);

    const constraintSequences = await Promise.all(
      constraintSequenceIds.map((id) => ctx.storageService.sequences.read(ctx.projectContext, id)),
    );

    const existingSequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
    const resolvedName =
      name ?? nextShuffleName(existingSequences.map((sequence) => sequence.name));

    const seed = randomSeed();
    // Throws ShuffleConstraintCycleError when the chosen constraints contradict
    // each other — the route maps it to 409 and nothing is written.
    const generated = generateShuffledSequence({
      projectUuid: ctx.projectContext.projectUUID,
      name: resolvedName,
      fragmentUuids,
      constraintSequences,
      random: createSeededRandom(seed),
    });

    await ctx.storageService.sequences.write(ctx.projectContext, generated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, generated.uuid);

    return {
      result,
      logEntries: [
        {
          type: "sequence:shuffled" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: generated.uuid, title: resolvedName },
          payload: {
            constraintSequenceUuids: constraintSequenceIds,
            fragmentCount: fragmentUuids.length,
            seed,
          },
          undoable: false,
        },
      ],
    };
  },
};
