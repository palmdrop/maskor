import type { SplitDelimiter } from "@maskor/importer";
import { splitByDelimiter, deriveKey } from "@maskor/importer";
import { deriveExcerpt } from "@maskor/shared";
import type { Command } from "../types";

export type PreviewSplitInput = {
  fragmentId: string;
  delimiter: SplitDelimiter;
};

export type SplitPiecePreview = {
  pieceIndex: number;
  key: string;
  excerpt: string;
};

export type PreviewSplitResult = {
  pieces: SplitPiecePreview[];
  count: number;
};

// Read-derivation, mirroring `preview-import`: runs through `executeCommand` with
// empty `logEntries` (no action-log entry) and writes nothing. Unlike
// preview-import it does not assemble a full { markdown, sections } document — the
// split dialog renders a lean list, so we return only piece keys + excerpts + a
// count.
export const previewSplitCommand: Command<PreviewSplitInput, PreviewSplitResult> = {
  async execute(ctx, input) {
    const fragment = await ctx.storageService.fragments.read(ctx.projectContext, input.fragmentId);
    const summaries = await ctx.storageService.fragments.readAllSummaries(ctx.projectContext);
    const existingKeys = new Set(
      summaries
        .filter((summary) => !summary.isDiscarded)
        .map((summary) => summary.key.toLowerCase()),
    );

    // Retain heading lines in piece content: a split must never drop prose (unlike
    // import, which lifts the heading into the new entity's title). See the spec.
    const rawPieces = splitByDelimiter(fragment.content, input.delimiter, {
      retainHeadingInContent: true,
    });

    const pieces: SplitPiecePreview[] = rawPieces.map((piece, index) => {
      // Piece 1 keeps the original's identity, so it reports the original's
      // existing key verbatim. Pieces 2…N get a deriveKey-derived key computed
      // against the existing keys — which still include the original's, so the
      // original's own key is never a false collision for the later pieces.
      const key =
        index === 0
          ? fragment.key
          : deriveKey({ headingText: piece.title, content: piece.content }, existingKeys);
      return {
        pieceIndex: index + 1,
        key,
        excerpt: deriveExcerpt(piece.content),
      };
    });

    return {
      result: { pieces, count: pieces.length },
      logEntries: [],
    };
  },
};
