import type { LogEntry } from "@maskor/shared";
import { assembleSequence } from "@maskor/exporter";
import { renderExport, type ExportFormat } from "@maskor/exporter";
import type { Command, CommandContext } from "../types";

export type ExportSequenceInput = {
  sequenceId: string;
  format: ExportFormat;
};

export type ExportSequenceResult = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  archivePath: string;
  fragmentCount: number;
};

const padTwo = (value: number) => String(value).padStart(2, "0");

const formatTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = padTwo(date.getMonth() + 1);
  const day = padTwo(date.getDate());
  const hours = padTwo(date.getHours());
  const minutes = padTwo(date.getMinutes());
  const seconds = padTwo(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

// Derive a safe filename stem from a sequence name.
const toFilenameStem = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sequence";

export const exportSequenceCommand: Command<ExportSequenceInput, ExportSequenceResult> = {
  async execute(ctx: CommandContext, input: ExportSequenceInput) {
    const { storageService, projectContext } = ctx;

    // Read sequence + fragments.
    const sequence = await storageService.sequences.read(projectContext, input.sequenceId);

    const allFragmentUuids = sequence.sections.flatMap((section) =>
      section.fragments.map((position) => position.fragmentUuid),
    );
    const uniqueUuids = [...new Set(allFragmentUuids)];

    const fragmentResults = await Promise.allSettled(
      uniqueUuids.map((uuid) => storageService.fragments.read(projectContext, uuid)),
    );

    const fragments = fragmentResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    // Read project preview config to inherit assembly options.
    const project = await storageService.getProject(projectContext.projectUUID);
    const { showTitles, showSectionHeadings, separator } = project.preview;

    // Assemble into markdown — no anchor sentinels for file export.
    const assembled = assembleSequence(sequence, fragments, {
      showTitles,
      showSectionHeadings,
      separator,
      includeAnchors: false,
    });

    const fragmentCount = assembled.sections.reduce(
      (total, section) => total + section.fragments.length,
      0,
    );

    // Render to the target format.
    const rendered = await renderExport(assembled.markdown, input.format);

    // Build a timestamped filename.
    const stem = toFilenameStem(sequence.name);
    const timestamp = formatTimestamp(new Date());
    const fileName = `${stem}-${timestamp}.${rendered.extension}`;

    // Archive to .maskor/exports/.
    const archivePath = await storageService.exports.archive(
      projectContext,
      fileName,
      rendered.bytes,
    );

    const logEntries: Omit<LogEntry, "id" | "timestamp">[] = [
      {
        type: "sequence:exported",
        actor: "user",
        target: {
          type: "sequence",
          uuid: sequence.uuid,
          key: sequence.name,
          title: sequence.name,
        },
        payload: {
          sequenceName: sequence.name,
          format: input.format,
          fileName,
          archivePath,
          fragmentCount,
        },
        undoable: false,
      },
    ];

    return {
      result: {
        bytes: rendered.bytes,
        mimeType: rendered.mimeType,
        fileName,
        archivePath,
        fragmentCount,
      },
      logEntries,
    };
  },
};
