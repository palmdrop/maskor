import type { SplitDelimiter } from "@maskor/importer";
import { splitByDelimiter, deriveKey, detectSplitDelimiter } from "@maskor/importer";
import { deriveExcerpt } from "@maskor/shared";
import type { Command } from "../types";

// The fallback when no delimiter is requested and the content has no structural
// delimiter to auto-detect: heading level 1. It yields a single piece (a no-op the
// dialog surfaces as "nothing to split"), prompting the user to pick a delimiter.
const DEFAULT_DELIMITER: SplitDelimiter = { type: "heading", level: 1 };

export type PreviewSplitInput = {
  fragmentId: string;
  // Optional: when omitted, the command auto-detects a smart default delimiter for
  // the fragment's content and returns it as `appliedDelimiter`.
  delimiter?: SplitDelimiter;
};

export type SplitPiecePreview = {
  pieceIndex: number;
  key: string;
  excerpt: string;
};

export type PreviewSplitResult = {
  pieces: SplitPiecePreview[];
  count: number;
  appliedDelimiter: SplitDelimiter;
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

    // No requested delimiter → smart-select one from the content (shallowest
    // splitting heading level → thematic break; never blank-line), falling back to
    // the default no-op delimiter when nothing would split.
    const appliedDelimiter =
      input.delimiter ?? detectSplitDelimiter(fragment.content) ?? DEFAULT_DELIMITER;

    // Retain heading lines in piece content: a split must never drop prose (unlike
    // import, which lifts the heading into the new entity's title). See the spec.
    const rawPieces = splitByDelimiter(fragment.content, appliedDelimiter, {
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
      result: { pieces, count: pieces.length, appliedDelimiter },
      logEntries: [],
    };
  },
};
