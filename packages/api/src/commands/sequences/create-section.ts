import { randomUUID } from "node:crypto";
import { assertSequenceMutable } from "@maskor/sequencer";
import type { Command } from "../types";

type CreateSectionInput = {
  sequenceId: string;
  name: string;
};

export const createSectionCommand: Command<CreateSectionInput, void> = {
  async execute(ctx, { sequenceId, name }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);
    assertSequenceMutable(indexed);

    const updated = {
      ...indexed,
      sections: [...indexed.sections, { uuid: randomUUID(), name, fragments: [] }],
    };

    await ctx.storageService.sequences.write(ctx.projectContext, updated);

    return {
      result: undefined,
      logEntries: [],
    };
  },
};
