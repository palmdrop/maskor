import { VaultError } from "@maskor/storage";
import type { Command } from "../types";

type DeleteSectionInput = {
  sequenceId: string;
  sectionId: string;
};

export const deleteSectionCommand: Command<DeleteSectionInput, void> = {
  async execute(ctx, { sequenceId, sectionId }) {
    const indexed = await ctx.storageService.sequences.read(ctx.projectContext, sequenceId);

    if (indexed.sections.length <= 1) {
      throw new VaultError(
        "KEY_CONFLICT",
        "Cannot delete the last remaining section of a sequence.",
        { reason: "cannot_delete_last_section" },
      );
    }

    const sectionExists = indexed.sections.some((s) => s.uuid === sectionId);
    if (!sectionExists) {
      throw new VaultError("ENTITY_NOT_FOUND", `Section ${sectionId} not found in sequence ${sequenceId}`);
    }

    const updatedSections = indexed.sections.filter((s) => s.uuid !== sectionId);

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
