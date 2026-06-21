import { deriveExcerpt } from "@maskor/shared";
import type { Comment } from "@api/generated/maskorAPI.schemas";

// A fragment block (a blank-line-separated paragraph) as the annotated-paragraphs column sees it.
// `markerId` is the comment anchor carried by the block (the first one), or null for an un-annotated
// paragraph. `text` is the marker-stripped, whitespace-collapsed opening used for the live excerpt.
export type FragmentBlock = {
  index: number;
  text: string;
  markerId: string | null;
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

// How far a tall idle comment may extend before it would meet the next anchored comment below it.
// For each row (document order), returns the vertical distance from this row's block top to the next
// commented row's top, or `null` when no comment lies below — in which case the comment may extend
// freely over the empty blocks beneath it. The clip target is the *next comment*, not the paragraph
// boundary, so a comment spans the intervening un-annotated blocks and is cut off only where it would
// collide with the next comment.
export const computeCommentClipHeights = (
  rows: readonly { top: number; hasComment: boolean }[],
): (number | null)[] => {
  const clipHeights: (number | null)[] = new Array(rows.length).fill(null);
  let nextCommentTop: number | null = null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    const gap = nextCommentTop === null ? null : nextCommentTop - row.top;
    // A non-positive gap (no comment below, or degenerate out-of-order tops) means there is nothing
    // to clip into — leave the row unclipped (null) rather than collapsing it to a 0px box.
    clipHeights[index] = gap !== null && gap > 0 ? gap : null;
    if (row.hasComment) {
      nextCommentTop = row.top;
    }
  }
  return clipHeights;
};

// Which empty slots are "covered" by an overflowing comment above them — one tall enough to extend
// down over the intervening un-annotated blocks to the next comment. A covered slot must not blanket
// that comment (a full-width hover button would steal the comment's wheel/clicks), so the column
// renders it as a compact, pointer-transparent affordance instead. Takes the rows in document order
// with each row's comment flag and whether its (clipped) comment overflows.
export const computeCoveredSlots = (
  rows: readonly { hasComment: boolean; isOverflowing: boolean }[],
): boolean[] => {
  let coveredByOverflow = false;
  return rows.map((row) => {
    if (row.hasComment) {
      coveredByOverflow = row.isOverflowing;
      return false;
    }
    return coveredByOverflow;
  });
};

// Fuzzy recovery (ADR 0009): re-anchor orphaned comments whose last-known excerpt still uniquely
// matches an un-anchored block's opening. Conservative — a comment is rebound only when exactly one
// free block matches (no silent mis-binding), and each block is consumed once so two orphans never
// claim the same block. Matches against the editor's own blocks, sharing its block-index space
// (never a re-parse). Returns the rebinds to apply (add the anchor at the block).
export const planOrphanRebinds = (
  blocks: readonly FragmentBlock[],
  orphans: readonly Comment[],
): { markerId: string; blockIndex: number }[] => {
  const consumed = new Set(blocks.filter((block) => block.markerId).map((block) => block.index));
  const plan: { markerId: string; blockIndex: number }[] = [];
  for (const orphan of orphans) {
    const target = deriveExcerpt(orphan.excerpt ?? "");
    if (target === "") continue;
    const candidates = blocks.filter(
      (block) => !consumed.has(block.index) && deriveExcerpt(block.text) === target,
    );
    if (candidates.length === 1) {
      const blockIndex = candidates[0]!.index;
      plan.push({ markerId: orphan.markerId, blockIndex });
      consumed.add(blockIndex);
    }
  }
  return plan;
};

// Focus navigation between slots (Tab / Shift-Tab and ↓/↑ at comment boundaries). Clamped to the
// row range; the caller decides when a boundary move applies (e.g. caret at the end of the body).
export const nextSlotIndex = (current: number, rowCount: number): number =>
  Math.min(current + 1, rowCount - 1);

export const previousSlotIndex = (current: number): number => Math.max(current - 1, 0);
