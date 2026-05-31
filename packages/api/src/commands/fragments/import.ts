import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Fragment, LogEntry, Sequence, SequenceOrigin } from "@maskor/shared";
import type { DocumentConverter, HeadingLevel } from "@maskor/importer";
import { splitMarkdown, splitPlainText, deriveKey } from "@maskor/importer";
import type { Command, CommandContext } from "../types";
import { createFragmentCommand } from "./create-fragment";

// Pick a sequence name not already taken, mirroring the fragment key-conflict
// convention: "Import: foo.docx", then "Import: foo.docx_1", etc.
const deriveUniqueSequenceName = (base: string, existingNames: Set<string>): string => {
  if (!existingNames.has(base)) {
    return base;
  }

  let suffix = 1;
  while (existingNames.has(`${base}_${suffix}`)) {
    suffix++;
  }

  return `${base}_${suffix}`;
};

// Build and persist the inactive import-sequence recording the created
// fragments in their original import order, pointing at the archived original.
const writeImportSequence = async (
  ctx: CommandContext,
  createdFragmentUuids: string[],
  sourceFileName: string,
  origin: SequenceOrigin,
  sequenceUuid: string,
): Promise<string> => {
  const existingSequences = await ctx.storageService.sequences.readAll(ctx.projectContext);
  const name = deriveUniqueSequenceName(
    `Import: ${sourceFileName}`,
    new Set(existingSequences.map((sequence) => sequence.name)),
  );

  const sequence: Sequence = {
    uuid: sequenceUuid,
    name,
    isMain: false,
    active: false,
    origin,
    projectUuid: ctx.projectContext.projectUUID,
    sections: [
      {
        uuid: randomUUID(),
        name: "Import",
        fragments: createdFragmentUuids.map((fragmentUuid, position) => ({
          uuid: randomUUID(),
          fragmentUuid,
          position,
        })),
      },
    ],
  };

  await ctx.storageService.sequences.write(ctx.projectContext, sequence);
  return sequence.uuid;
};

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
  importSequenceUuid?: string;
};

const EXTENSION_BY_FORMAT: Record<ImportInput["format"], string> = {
  docx: ".docx",
  plaintext: ".txt",
  markdown: ".md",
};

const archiveExtension = (sourceFileName: string, format: ImportInput["format"]): string => {
  const fromName = extname(sourceFileName);
  if (fromName) {
    return fromName;
  }

  return EXTENSION_BY_FORMAT[format];
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

    // Capture import order + archive the original — only when at least one
    // fragment was created (an empty import has nothing to order or preserve).
    // TODO: the archive is written before the sequence; if writeImportSequence
    // throws, the archived bytes are left orphaned under .maskor/imports/. Clean
    // up the archive on failure once storageService.imports exposes a delete.
    let importSequenceUuid: string | undefined;
    if (created.length) {
      const sequenceUuid = randomUUID();
      const archiveFileName = `${sequenceUuid}${archiveExtension(input.sourceFileName, input.format)}`;
      const archivePath = await ctx.storageService.imports.archive(
        ctx.projectContext,
        archiveFileName,
        input.file,
      );
      const origin: SequenceOrigin = {
        fileName: input.sourceFileName,
        archivePath,
        format: input.format,
        importedAt: new Date().toISOString(),
      };
      importSequenceUuid = await writeImportSequence(
        ctx,
        created,
        input.sourceFileName,
        origin,
        sequenceUuid,
      );
    }

    const importPayload =
      input.format === "plaintext"
        ? {
            sourceFileName: input.sourceFileName,
            fragmentCount: created.length,
            format: input.format,
            delimiter: input.delimiter,
            ...(importSequenceUuid ? { importSequenceUuid } : {}),
          }
        : {
            sourceFileName: input.sourceFileName,
            fragmentCount: created.length,
            format: input.format,
            headingLevel: input.headingLevel,
            ...(importSequenceUuid ? { importSequenceUuid } : {}),
          };

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [
      {
        type: "fragment:imported",
        actor: "user",
        target: {
          type: "fragment",
          uuid: randomUUID(),
          key: input.sourceFileName,
          title: input.sourceFileName,
        },
        payload: importPayload,
        undoable: false,
      },
    ];

    return { result: { created, errors, importSequenceUuid }, logEntries };
  },
});
