import { randomUUID } from "node:crypto";
import type { Sequence, SequenceOrigin } from "@maskor/shared";
import { validateSequenceName } from "@maskor/shared";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

// The sequence name is empty (or whitespace-only). The route-level schema only
// enforces `min(1)`, so a whitespace-only name reaches the command; this is the
// command-level guard. Surfaced as a 400 (SEQUENCE_NAME_INVALID).
export class SequenceNameInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SequenceNameInvalidError";
  }
}

// Validate + trim a sequence name, wrapping the shared helper's Error in the
// command-level domain error. Shared by create and rename.
export const resolveSequenceName = (rawName: string): string => {
  try {
    return validateSequenceName(rawName);
  } catch (error) {
    throw new SequenceNameInvalidError((error as Error).message);
  }
};

type CreateSequenceInput = {
  name: string;
  isMain: boolean;
  active?: boolean;
  origin?: SequenceOrigin;
};

export const createSequenceCommand: Command<CreateSequenceInput, IndexedSequence> = {
  async execute(ctx, { name, isMain, active, origin }) {
    const sequence: Sequence = {
      uuid: randomUUID(),
      name: resolveSequenceName(name),
      isMain,
      active: active ?? true,
      ...(origin ? { origin } : {}),
      projectUuid: ctx.projectContext.projectUUID,
      sections: [{ uuid: randomUUID(), name: "Main", fragments: [] }],
    };

    await ctx.storageService.sequences.write(ctx.projectContext, sequence);
    const created = await ctx.storageService.sequences.read(ctx.projectContext, sequence.uuid);

    return {
      result: created,
      logEntries: [
        {
          type: "sequence:created" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequence.uuid },
          payload: {},
          undoable: false,
        },
      ],
    };
  },
};
