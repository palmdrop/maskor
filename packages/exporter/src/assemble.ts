import type { Fragment, AssembledSequence } from "@maskor/shared";
import { assembleMarkdown, type AssemblyBlock, type AssemblyOptions } from "./assemble-markdown";
import type { AssembledDocument, NavSection } from "./types";

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

  const blocks: AssemblyBlock[] = [];
  const sections: NavSection[] = [];

  for (const section of assembled.sections) {
    blocks.push({ kind: "section-heading", text: section.name });

    const navFragments = section.fragments.map((fragment) => {
      blocks.push({ kind: "title", text: fragment.key });
      blocks.push({ kind: "body", anchorId: fragment.uuid, content: fragment.content });
      return { uuid: fragment.uuid, key: fragment.key };
    });

    sections.push({ uuid: section.uuid, name: section.name, fragments: navFragments });
  }

  const markdown = assembleMarkdown(blocks, options);

  return { markdown, sections };
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
