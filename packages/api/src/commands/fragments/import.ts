import { randomUUID } from "node:crypto";
import type { Fragment, LogEntry } from "@maskor/shared";
import type { DocumentConverter, HeadingLevel } from "@maskor/importer";
import { splitMarkdown, splitPlainText, deriveKey } from "@maskor/importer";
import type { Command } from "../types";
import { createFragmentCommand } from "./create-fragment";

export type ImportInput =
  | {
      projectId: string;
      file: Uint8Array;
      format: "markdown";
      headingLevel: HeadingLevel;
    }
  | {
      projectId: string;
      file: Uint8Array;
      format: "docx";
      headingLevel: HeadingLevel;
    }
  | {
      projectId: string;
      file: Uint8Array;
      format: "plaintext";
      delimiter: string;
    };

export type ImportError = {
  pieceIndex: number;
  pieceKey?: string;
  error: string;
};

export type ImportResult = {
  created: string[];
  errors: ImportError[];
};

export const createImportCommand = (
  converter: DocumentConverter,
): Command<ImportInput, ImportResult> => ({
  async execute(ctx, input) {
    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const existingKeys = new Set(
      summaries.filter((s) => !s.isDiscarded).map((s) => s.key.toLowerCase()),
    );

    let markdownContent: string;
    if (input.format === "docx") {
      markdownContent = await converter.toMarkdown(input.file);
    } else {
      markdownContent = new TextDecoder().decode(input.file);
    }

    const pieces =
      input.format === "plaintext"
        ? splitPlainText(markdownContent, input.delimiter)
        : splitMarkdown(markdownContent, input.headingLevel);

    const created: string[] = [];
    const errors: ImportError[] = [];
    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [];

    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index]!;
      const pieceIndex = index + 1;

      const rawPiece = { headingText: piece.title, content: piece.content };
      const key = deriveKey(rawPiece, existingKeys);

      const draft: Fragment = {
        uuid: randomUUID(),
        key,
        content: piece.content,
        isDiscarded: false,
        readyStatus: 0,
        notes: [],
        references: [],
        aspects: {},
        contentHash: "",
        updatedAt: new Date(),
      };

      try {
        const { result: fragment, logEntries: pieceLogEntries } =
          await createFragmentCommand.execute(ctx, draft);
        created.push(fragment.uuid);
        logEntries.push(...pieceLogEntries);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ pieceIndex, pieceKey: key, error: message });
      }
    }

    return { result: { created, errors }, logEntries };
  },
});
