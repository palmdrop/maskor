import { VaultError } from "@maskor/storage";
import type { Command } from "../types";

type RenameSectionInput = {
  sequenceId: string;
  sectionId: string;
  name: string;
};

export const renameSectionCommand: Command<RenameSectionInput, void> = {
  async execute(ctx, { sequenceId, sectionId, name }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    const sectionIndex = indexed.sections.findIndex((s) => s.uuid === sectionId);
    if (sectionIndex === -1) {
      throw new VaultError("ENTITY_NOT_FOUND", `Section ${sectionId} not found in sequence ${sequenceId}`);
    }

    const updatedSections = indexed.sections.map((section, index) =>
      index === sectionIndex ? { ...section, name } : section,
    );

    await ctx.storageService.sequences.write(ctx.projectContext, {
      ...indexed,
      sections: updatedSections,
    });

    return {
      result: undefined,
      logEntries: [],
    };
  },
};
