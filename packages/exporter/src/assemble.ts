import type { Fragment, AssembledSequence } from "@maskor/shared";
import {
  assembleMarkdown,
  assembleAnnotated,
  type AssemblyBlock,
  type AssemblyOptions,
  type BlockAnnotations,
  type CommentAnnotation,
  type ReferenceAnnotation,
} from "./assemble-markdown";
import type { AssembledDocument, ExportAssembly, NavSection } from "./types";

type SequenceInput = {
  uuid: string;
  name: string;
  isMain: boolean;
  sections: Array<{
    uuid: string;
    name: string;
    fragments: Array<{
      uuid: string;
      fragmentUuid: string;
      position: number;
    }>;
  }>;
};

// Resolve a sequence + its fragments into the ordered, content-bearing
// structure. Skip rules: a position whose fragment is missing (structural
// drift) or discarded is dropped. This structure is kept internal — it feeds
// both the markdown blocks and the lean nav so the two can never diverge.
const buildAssembledSequence = (
  sequence: SequenceInput,
  fragments: Fragment[],
): AssembledSequence => {
  const fragmentMap = new Map(fragments.map((fragment) => [fragment.uuid, fragment]));

  const sections = sequence.sections.map((section) => {
    const sorted = [...section.fragments].sort((a, b) => a.position - b.position);

    const assembledFragments = sorted.flatMap((position) => {
      const fragment = fragmentMap.get(position.fragmentUuid);

      if (!fragment) {
        console.warn(
          `[assembleSequence] Fragment ${position.fragmentUuid} not found — skipping (structural drift).`,
        );
        return [];
      }

      if (fragment.isDiscarded) {
        return [];
      }

      return [{ uuid: fragment.uuid, key: fragment.key, content: fragment.content }];
    });

    return { uuid: section.uuid, name: section.name, fragments: assembledFragments };
  });

  return {
    sequenceUuid: sequence.uuid,
    sequenceName: sequence.name,
    isMain: sequence.isMain,
    sections,
  };
};

type SequenceAssemblyOptions = Pick<
  AssemblyOptions,
  "separator" | "showTitles" | "showSectionHeadings" | "includeAnchors"
>;

// One assembled fragment as it appears in the section/nav loop below.
type AssembledFragment = AssembledSequence["sections"][number]["fragments"][number];

// Build the ordered assembly blocks and the parallel lean nav from a resolved
// sequence. Both the plain and the export assemblies build them here so the two
// can never diverge (skip rules, nav shape, block ordering). Pass
// `resolveAnnotations` to attach per-fragment annotations to each body block;
// omit it for the plain, annotation-free assembly.
const buildSequenceBlocks = (
  assembled: AssembledSequence,
  resolveAnnotations?: (fragment: AssembledFragment) => BlockAnnotations,
): { blocks: AssemblyBlock[]; sections: NavSection[] } => {
  const blocks: AssemblyBlock[] = [];
  const sections: NavSection[] = [];

  for (const section of assembled.sections) {
    blocks.push({ kind: "section-heading", text: section.name });

    const navFragments = section.fragments.map((fragment) => {
      blocks.push({ kind: "title", text: fragment.key });
      blocks.push({
        kind: "body",
        anchorId: fragment.uuid,
        content: fragment.content,
        ...(resolveAnnotations ? { annotations: resolveAnnotations(fragment) } : {}),
      });
      return { uuid: fragment.uuid, key: fragment.key };
    });

    sections.push({ uuid: section.uuid, name: section.name, fragments: navFragments });
  }

  return { blocks, sections };
};

/**
 * Assemble a sequence into a complete markdown string plus a lean nav payload.
 * Section names become `##`, fragment keys become `###` titles, and each body
 * carries a stable anchor (the fragment uuid) when `includeAnchors` is set.
 */
export const assembleSequence = (
  sequence: SequenceInput,
  fragments: Fragment[],
  options: SequenceAssemblyOptions,
): AssembledDocument => {
  const assembled = buildAssembledSequence(sequence, fragments);
  const { blocks, sections } = buildSequenceBlocks(assembled);

  const markdown = assembleMarkdown(blocks, options);

  return { markdown, sections };
};

// The per-fragment annotation payload the caller resolves (Margin notes/comments
// and the bodies of attached references) and hands to the export assembly, keyed
// by fragment uuid. `comments`/`references` mirror the assembler's block shape.
export type FragmentAnnotations = {
  notes: string;
  comments: CommentAnnotation[];
  references: ReferenceAnnotation[];
};

// The annotation input for a whole export: the two toggles plus the per-fragment
// data. When both toggles are off this collapses to the plain assembly (markers
// stripped, no footnotes) — byte-identical to `assembleSequence`.
export type SequenceAnnotations = {
  includeReferences: boolean;
  includeMarginAnnotations: boolean;
  byFragmentUuid: Record<string, FragmentAnnotations>;
};

const EMPTY_FRAGMENT_ANNOTATIONS: FragmentAnnotations = {
  notes: "",
  comments: [],
  references: [],
};

/**
 * Assemble a sequence for file export with References/Margin annotations.
 *
 * Returns both markdown dialects (see `ExportAssembly`): `markdown` for md/txt
 * and `docxMarkdown` + `commentBodies` for the Word path, plus the nav payload
 * and any orphaned-comment warnings. When both toggles are off the two markdown
 * strings are byte-identical to `assembleSequence`'s output.
 */
export const assembleSequenceForExport = (
  sequence: SequenceInput,
  fragments: Fragment[],
  options: SequenceAssemblyOptions,
  annotations: SequenceAnnotations,
): ExportAssembly => {
  const assembled = buildAssembledSequence(sequence, fragments);
  const { blocks, sections } = buildSequenceBlocks(assembled, (fragment) => {
    const fragmentAnnotations =
      annotations.byFragmentUuid[fragment.uuid] ?? EMPTY_FRAGMENT_ANNOTATIONS;
    return {
      fragmentKey: fragment.key,
      notes: fragmentAnnotations.notes,
      comments: fragmentAnnotations.comments,
      references: fragmentAnnotations.references,
    };
  });

  const assemblyOptions: AssemblyOptions = {
    ...options,
    includeReferences: annotations.includeReferences,
    includeMarginAnnotations: annotations.includeMarginAnnotations,
  };
  const { footnote, docx } = assembleAnnotated(blocks, assemblyOptions);

  return {
    markdown: footnote.markdown,
    docxMarkdown: docx.markdown,
    commentBodies: docx.commentBodies,
    warnings: footnote.warnings,
    sections,
  };
};

export type ImportPiece = {
  pieceIndex: number;
  derivedKey: string;
  content: string;
};

/**
 * Assemble import-preview pieces into the same `{ markdown, sections }` shape as
 * a sequence. Pieces form one unnamed section; the anchor id is the piece index
 * and the title is `"<index>. <key>"`. Presentation is fixed: horizontal-rule
 * separators, titles shown, no section heading.
 */
export const assemblePieces = (pieces: ImportPiece[]): AssembledDocument => {
  const blocks: AssemblyBlock[] = [];

  const navFragments = pieces.map((piece) => {
    const anchorId = String(piece.pieceIndex);
    blocks.push({ kind: "title", text: `${piece.pieceIndex}. ${piece.derivedKey}` });
    blocks.push({ kind: "body", anchorId, content: piece.content });
    return { uuid: anchorId, key: piece.derivedKey };
  });

  const markdown = assembleMarkdown(blocks, {
    separator: "horizontal-rule",
    showTitles: true,
    showSectionHeadings: false,
    includeAnchors: true,
  });

  return { markdown, sections: [{ uuid: "", name: "", fragments: navFragments }] };
};
