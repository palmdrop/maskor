import type { SplitDelimiter } from "@maskor/importer";
import { splitByDelimiter, deriveKey, detectSplitDelimiter } from "@maskor/importer";
import { deriveExcerpt } from "@maskor/shared";
import type { Command } from "../types";
import { resolveOriginalPieceKey } from "./split-piece-keys";

// The fallback when no delimiter is requested and the content has no structural
// delimiter to auto-detect: heading level 1. It yields a single piece (a no-op the
// dialog surfaces as "nothing to split"), prompting the user to pick a delimiter.
const DEFAULT_DELIMITER: SplitDelimiter = { type: "heading", level: 1 };

export type PreviewSplitInput = {
  fragmentId: string;
  // Optional: when omitted, the command auto-detects a smart default delimiter for
  // the fragment's content and returns it as `appliedDelimiter`.
  delimiter?: SplitDelimiter;
  // When false (the default), a heading line that starts a piece is stripped from
  // the body and becomes the piece's key — including piece 1 (the original is
  // renamed to its leading heading). When true, headings stay in the body (piece 1
  // keeps its key). Only affects heading splits; the other delimiters carry no
  // heading. Mirrors `retainHeadingInContent` on the importer.
  keepHeadingInBody?: boolean;
};

export type SplitPiecePreview = {
  pieceIndex: number;
  key: string;
  excerpt: string;
  // True for piece 1 only when the original will be renamed to its heading-derived
  // key (heading stripped). Lets the dialog signal the original's key is changing.
  renamedOriginal?: boolean;
};

export type PreviewSplitResult = {
  pieces: SplitPiecePreview[];
  count: number;
  appliedDelimiter: SplitDelimiter;
  // The original fragment's current key. Piece 1's preview key may be a heading-
  // derived rename (`renamedOriginal`), so the dialog can't recover the pre-rename
  // key from the piece list alone — it needs this to tell whether editing piece 1
  // back to the original's own key is actually a rename (it is not).
  originalKey: string;
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

    // Default: strip the heading from each piece's body (it becomes the key). Opt in
    // to keep headings in the body via `keepHeadingInBody`. Only heading splits carry
    // a heading; the other delimiters ignore the option.
    const keepHeadingInBody = input.keepHeadingInBody ?? false;
    const rawPieces = splitByDelimiter(fragment.content, appliedDelimiter, {
      retainHeadingInContent: keepHeadingInBody,
    });

    // Derive keys the same way the split command does, so the preview matches the
    // commit. Piece 1 resolves against the other fragments' keys (its own excluded,
    // so a heading matching the current key is not a false collision); the reserved
    // key then seeds the later pieces' derivation.
    const otherKeys = new Set(existingKeys);
    otherKeys.delete(fragment.key.toLowerCase());
    const firstPieceKey = rawPieces.length
      ? resolveOriginalPieceKey(rawPieces[0]!, fragment.key, keepHeadingInBody, otherKeys)
      : { key: fragment.key, renamed: false };

    const pieces: SplitPiecePreview[] = rawPieces.map((piece, index) => {
      if (index === 0) {
        return {
          pieceIndex: 1,
          key: firstPieceKey.key,
          excerpt: deriveExcerpt(piece.content),
          ...(firstPieceKey.renamed ? { renamedOriginal: true } : {}),
        };
      }

      return {
        pieceIndex: index + 1,
        key: deriveKey({ headingText: piece.title, content: piece.content }, otherKeys),
        excerpt: deriveExcerpt(piece.content),
      };
    });

    return {
      result: { pieces, count: pieces.length, appliedDelimiter, originalKey: fragment.key },
      logEntries: [],
    };
  },
};
