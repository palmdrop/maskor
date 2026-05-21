import type { Command } from "./types";

export type CutBodyInput = {
  sourceType: "fragment" | "note" | "reference" | "aspect";
  sourceId: string;
  textToRemove: string;
};

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
};

// Removes textToRemove from the source entity's body. Emits no log entries — the
// cut is a downstream effect of the append/prepend operation, which is already logged.
// Returns true if exactly one occurrence was found and removed; false otherwise.
export const cutBodyCommand: Command<CutBodyInput, boolean> = {
  async execute(ctx, { sourceType, sourceId, textToRemove }) {
    switch (sourceType) {
      case "fragment": {
        const entity = await ctx.storageService.fragments.read(ctx.projectContext, sourceId);
        if (countOccurrences(entity.content, textToRemove) !== 1) {
          return { result: false, logEntries: [] };
        }
        await ctx.storageService.fragments.write(ctx.projectContext, {
          ...entity,
          content: entity.content.replace(textToRemove, ""),
        });
        return { result: true, logEntries: [] };
      }
      case "note": {
        const entity = await ctx.storageService.notes.read(ctx.projectContext, sourceId);
        if (countOccurrences(entity.content, textToRemove) !== 1) {
          return { result: false, logEntries: [] };
        }
        await ctx.storageService.notes.update(ctx.projectContext, sourceId, {
          content: entity.content.replace(textToRemove, ""),
        });
        return { result: true, logEntries: [] };
      }
      case "reference": {
        const entity = await ctx.storageService.references.read(ctx.projectContext, sourceId);
        if (countOccurrences(entity.content, textToRemove) !== 1) {
          return { result: false, logEntries: [] };
        }
        await ctx.storageService.references.update(ctx.projectContext, sourceId, {
          content: entity.content.replace(textToRemove, ""),
        });
        return { result: true, logEntries: [] };
      }
      case "aspect": {
        const entity = await ctx.storageService.aspects.read(ctx.projectContext, sourceId);
        const description = entity.description ?? "";
        if (countOccurrences(description, textToRemove) !== 1) {
          return { result: false, logEntries: [] };
        }
        await ctx.storageService.aspects.update(ctx.projectContext, sourceId, {
          description: description.replace(textToRemove, ""),
        });
        return { result: true, logEntries: [] };
      }
    }
  },
};
