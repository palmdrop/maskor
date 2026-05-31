import { randomUUID } from "node:crypto";
import type { Sequence, SequenceOrigin } from "@maskor/shared";
import type { IndexedSequence } from "@maskor/storage";
import type { Command } from "../types";

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
      name,
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
