import { placeFragment } from "@maskor/sequencer";
import { VaultError } from "@maskor/storage";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

type PlaceFragmentInput = {
  sequenceId: string;
  fragmentUuid: string;
  sectionUuid: string;
  position: number;
  sequenceName: string;
  fragmentKey: string;
};

export const placeFragmentCommand: Command<PlaceFragmentInput, IndexedSequence> = {
  async execute(ctx, { sequenceId, fragmentUuid, sectionUuid, position, sequenceName, fragmentKey }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    let updated;
    try {
      updated = placeFragment(indexed, fragmentUuid, sectionUuid, position);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already placed")) {
        throw new VaultError("KEY_CONFLICT", message, { reason: "fragment_already_placed" });
      }
      throw error;
    }
    await ctx.storageService.sequences.write(ctx.projectContext, updated);
    const result = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    return {
      result,
      logEntries: [
        {
          type: "sequence:fragment-placed" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { fragmentKey },
          undoable: true,
        },
      ],
    };
  },
};
