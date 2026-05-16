import type { DocumentConverter, HeadingLevel } from "@maskor/importer";
import { splitMarkdown, splitPlainText, deriveKey } from "@maskor/importer";
import type { Command } from "../types";
import type { ImportInput } from "./import";

export type PreviewPiece = {
  pieceIndex: number;
  title?: string;
  derivedKey: string;
  content: string;
};

export type PreviewImportResult = {
  pieces: PreviewPiece[];
  format: "markdown" | "docx" | "plaintext";
  convertedMarkdown: string;
};

export const createPreviewImportCommand = (
  converter: DocumentConverter,
): Command<ImportInput, PreviewImportResult> => ({
  async execute(ctx, input) {
    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const existingKeys = new Set(
      summaries.filter((s) => !s.isDiscarded).map((s) => s.key.toLowerCase()),
    );

    let convertedMarkdown: string;
    if (input.format === "docx") {
      convertedMarkdown = await converter.toMarkdown(input.file);
    } else {
      convertedMarkdown = new TextDecoder().decode(input.file);
    }

    const rawPieces =
      input.format === "plaintext"
        ? splitPlainText(convertedMarkdown, input.delimiter)
        : splitMarkdown(convertedMarkdown, input.headingLevel as HeadingLevel);

    const pieces: PreviewPiece[] = rawPieces.map((piece, index) => {
      const key = deriveKey({ headingText: piece.title, content: piece.content }, existingKeys);
      return {
        pieceIndex: index + 1,
        title: piece.title,
        derivedKey: key,
        content: piece.content,
      };
    });

    return {
      result: { pieces, format: input.format, convertedMarkdown },
      logEntries: [],
    };
  },
});
