import { moveSection } from "@maskor/sequencer";
import { VaultError } from "@maskor/storage";
import type { Command } from "../types";

type MoveSectionInput = {
  sequenceId: string;
  sectionId: string;
  position: number;
  sequenceName: string;
  sectionName: string;
};

export const moveSectionCommand: Command<MoveSectionInput, void> = {
  async execute(ctx, { sequenceId, sectionId, position, sequenceName, sectionName }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    const sectionExists = indexed.sections.some((s) => s.uuid === sectionId);
    if (!sectionExists) {
      throw new VaultError(
        "ENTITY_NOT_FOUND",
        `Section ${sectionId} not found in sequence ${sequenceId}`,
      );
    }

    const updated = moveSection(indexed, sectionId, position);
    await ctx.storageService.sequences.write(ctx.projectContext, updated);

    return {
      result: undefined,
      logEntries: [
        {
          type: "sequence:section-reordered" as const,
          actor: ctx.actor,
          target: { type: "sequence" as const, uuid: sequenceId, title: sequenceName },
          payload: { sectionName },
          undoable: true,
        },
      ],
    };
  },
};
