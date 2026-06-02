import { stripCommentMarkers, extractCommentMarkerIds, deriveExcerpt } from "@maskor/shared";
import type { Comment } from "@api/generated/maskorAPI.schemas";

// A fragment block (a blank-line-separated paragraph) as the annotated-paragraphs column sees it.
// `markerId` is the comment anchor carried by the block (the first one), or null for an un-annotated
// paragraph. `text` is the marker-stripped, whitespace-collapsed opening used for the live excerpt.
export type FragmentBlock = {
  index: number;
  text: string;
  markerId: string | null;
};

// Enumerate the fragment's blocks in document order. A block is a run separated by blank lines —
// the markdown notion of a paragraph — matching `extractBlockOpening`. Blank runs are skipped. The
// index is the position among non-blank blocks, used to target a block for type-to-create.
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

// One row of the annotated-paragraphs column: a block plus its bound comment (or null for an
// un-annotated paragraph — its slot reveals on hover and creates on type).
export type SlotRow = {
  block: FragmentBlock;
  comment: Comment | null;
};

// The column laid out from the live buffer: a slot per block (binding derived live from each marker's
// current position — never a cached ordinal, so a moved paragraph carries its comment) plus the
// orphaned comments (markers no longer present in any block) gathered for the foot group.
export type Column = {
  rows: SlotRow[];
  orphans: Comment[];
};

export const buildColumn = (blocks: FragmentBlock[], comments: Comment[]): Column => {
  const byMarker = new Map(comments.map((comment) => [comment.markerId, comment] as const));
  const bound = new Set<string>();

  const rows: SlotRow[] = blocks.map((block) => {
    const comment = block.markerId ? (byMarker.get(block.markerId) ?? null) : null;
    if (comment) bound.add(comment.markerId);
    return { block, comment };
  });

  const orphans = comments.filter((comment) => !bound.has(comment.markerId));
  return { rows, orphans };
};

// Focus navigation between slots (Tab / Shift-Tab and ↓/↑ at comment boundaries). Clamped to the
// row range; the caller decides when a boundary move applies (e.g. caret at the end of the body).
export const nextSlotIndex = (current: number, rowCount: number): number =>
  Math.min(current + 1, rowCount - 1);

export const previousSlotIndex = (current: number): number => Math.max(current - 1, 0);
