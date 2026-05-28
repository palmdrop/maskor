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
      sourceFileName: string;
      format: "markdown";
      headingLevel: HeadingLevel;
    }
  | {
      projectId: string;
      file: Uint8Array;
      sourceFileName: string;
      format: "docx";
      headingLevel: HeadingLevel;
    }
  | {
      projectId: string;
      file: Uint8Array;
      sourceFileName: string;
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
        readiness: 0,
        notes: [],
        references: [],
        aspects: {},
        contentHash: "",
        updatedAt: new Date(),
      };

      try {
        const { result: fragment } = await createFragmentCommand.execute(ctx, draft);
        created.push(fragment.uuid);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ pieceIndex, pieceKey: key, error: message });
      }
    }

    const importPayload =
      input.format === "plaintext"
        ? { sourceFileName: input.sourceFileName, fragmentCount: created.length, format: input.format, delimiter: input.delimiter }
        : { sourceFileName: input.sourceFileName, fragmentCount: created.length, format: input.format, headingLevel: input.headingLevel };

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [
      {
        type: "fragment:imported",
        actor: "user",
        target: { type: "fragment", uuid: randomUUID(), key: input.sourceFileName, title: input.sourceFileName },
        payload: importPayload,
        undoable: false,
      },
    ];

    return { result: { created, errors }, logEntries };
  },
});
