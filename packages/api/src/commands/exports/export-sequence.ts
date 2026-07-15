import type { Fragment, LogEntry, ExportSeparator } from "@maskor/shared";
import {
  assembleSequenceForExport,
  renderExport,
  type ExportFormat,
  type FragmentAnnotations,
  type OrphanWarning,
  type SequenceAnnotations,
} from "@maskor/exporter";
import type { Command, CommandContext } from "../types";

export type ExportSequenceInput = {
  sequenceId: string;
  format: ExportFormat;
  // Per-export overrides from the dialog. When present each beats the project's
  // persisted `export` config; when absent the config value is used.
  includeReferences?: boolean;
  includeMarginAnnotations?: boolean;
  showTitles?: boolean;
  showSectionHeadings?: boolean;
  separator?: ExportSeparator;
};

export type ExportSequenceResult = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  archivePath: string;
  fragmentCount: number;
  // Orphaned-comment warnings surfaced from the assembly (empty when none). Only
  // populated when the margin-annotation toggle is on.
  warnings: OrphanWarning[];
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

// Resolve the per-fragment annotation payload the export assembly consumes,
// keyed by fragment uuid. Only fetches the data an enabled toggle needs:
// margins (notes + comments) when `includeMarginAnnotations`, attached reference
// bodies when `includeReferences`. Reference keys are resolved to bodies via the
// index (key → uuid) and read once per unique reference; an unresolvable key is
// skipped so a dangling attachment cannot crash the export.
const gatherFragmentAnnotations = async (
  ctx: CommandContext,
  fragments: Fragment[],
  includeReferences: boolean,
  includeMarginAnnotations: boolean,
): Promise<Record<string, FragmentAnnotations>> => {
  const { storageService, projectContext } = ctx;

  // key → uuid map for reference resolution, built once when references are on.
  const referenceUuidByKey = new Map<string, string>();
  if (includeReferences) {
    const indexedReferences = await storageService.references.readAll(projectContext);
    for (const indexed of indexedReferences) {
      referenceUuidByKey.set(indexed.key, indexed.uuid);
    }
  }

  // uuid → body cache so a reference shared by multiple fragments is read once.
  const referenceBodyByUuid = new Map<string, string>();
  const resolveReferenceBody = async (uuid: string): Promise<string> => {
    const cached = referenceBodyByUuid.get(uuid);
    if (cached !== undefined) return cached;
    const reference = await storageService.references.read(projectContext, uuid);
    referenceBodyByUuid.set(uuid, reference.content);
    return reference.content;
  };

  const byFragmentUuid: Record<string, FragmentAnnotations> = {};

  for (const fragment of fragments) {
    let notes = "";
    const comments: FragmentAnnotations["comments"] = [];
    const references: FragmentAnnotations["references"] = [];

    if (includeMarginAnnotations) {
      const margin = await storageService.margins.read(projectContext, fragment.uuid);
      if (margin) {
        notes = margin.notes;
        for (const comment of margin.comments) {
          comments.push({ markerId: comment.markerId, body: comment.body });
        }
      }
    }

    if (includeReferences) {
      // Frontmatter attachment order is `fragment.references`.
      for (const key of fragment.references) {
        const uuid = referenceUuidByKey.get(key);
        if (!uuid) continue; // dangling attachment — skip gracefully.
        const body = await resolveReferenceBody(uuid);
        references.push({ key, body });
      }
    }

    byFragmentUuid[fragment.uuid] = { notes, comments, references };
  }

  return byFragmentUuid;
};

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

    // Read project config: the `export` block owns every export setting — the
    // two annotation toggles plus the assembly options (titles, section
    // headings, separator). A per-export body override (dialog state) beats the
    // persisted config when present.
    const project = await storageService.getProject(projectContext.projectUUID);

    const includeReferences = input.includeReferences ?? project.export.includeReferences;
    const includeMarginAnnotations =
      input.includeMarginAnnotations ?? project.export.includeMarginAnnotations;
    const showTitles = input.showTitles ?? project.export.showTitles;
    const showSectionHeadings = input.showSectionHeadings ?? project.export.showSectionHeadings;
    const separator = input.separator ?? project.export.separator;

    // Gather per-fragment annotation data — only what the enabled toggles need.
    const byFragmentUuid = await gatherFragmentAnnotations(
      ctx,
      fragments,
      includeReferences,
      includeMarginAnnotations,
    );

    const annotations: SequenceAnnotations = {
      includeReferences,
      includeMarginAnnotations,
      byFragmentUuid,
    };

    // Assemble into markdown — no anchor sentinels for file export.
    const assembled = assembleSequenceForExport(
      sequence,
      fragments,
      {
        showTitles,
        showSectionHeadings,
        separator,
        includeAnchors: false,
      },
      annotations,
    );

    const fragmentCount = assembled.sections.reduce(
      (total, section) => total + section.fragments.length,
      0,
    );

    // Render to the target format. The docx path consumes `docxMarkdown` +
    // `commentBodies`; md/txt use `markdown`.
    const rendered = await renderExport(
      {
        markdown: assembled.markdown,
        docxMarkdown: assembled.docxMarkdown,
        commentBodies: assembled.commentBodies,
      },
      input.format,
    );

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

    const logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[] = [
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
          includeReferences,
          includeMarginAnnotations,
          showTitles,
          showSectionHeadings,
          separator,
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
        warnings: assembled.warnings,
      },
      logEntries,
    };
  },
};
