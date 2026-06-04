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
