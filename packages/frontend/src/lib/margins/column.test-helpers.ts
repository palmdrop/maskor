import { stripCommentMarkers, extractCommentMarkerIds, deriveExcerpt } from "@maskor/shared";
import type { FragmentBlock } from "./column";

// Test-only: enumerate a markdown string's blank-line-separated blocks into the `FragmentBlock[]`
// shape the editor's `getBlocks()` emits at runtime (ADR 0009 — the editor, not a markdown re-parse,
// is the production source of block geometry). Used by the column/margin tests to drive the pure
// layout logic without a live editor. Not part of the production render path.
export const enumerateBlocks = (content: string): FragmentBlock[] => {
  const blocks: FragmentBlock[] = [];
  let index = 0;
  for (const raw of content.split(/\n[ \t]*\n/)) {
    if (raw.trim() === "") continue;
    blocks.push({
      index: index++,
      text: deriveExcerpt(stripCommentMarkers(raw)),
      markerId: extractCommentMarkerIds(raw)[0] ?? null,
    });
  }
  return blocks;
};
