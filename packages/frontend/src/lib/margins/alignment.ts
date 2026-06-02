// Mutual flow alignment between the fragment editor and the Margin column (ADR 0009).
//
// Each row is as tall as the taller of its block-slot and its comment:
//   - the margin pads a comment shorter than its slot up to the slot height (`minHeight`), and
//   - the editor pushes the next block down by `spacer` for a comment taller than its slot (a
//     document-side widget that adds vertical space without touching buffer text).
//
// The inputs are *natural* (pre-spacer) measurements: `naturalSlotHeight` is the block's height
// including the inter-block gap to the next block (so the column inherits the editor's vertical
// rhythm), measured with the current spacer backed out — see `naturalSlotHeights`. Because the
// spacer is derived from spacer-independent measurements, a single apply pass converges (the spacer
// does not feed back into its own input).

export type BlockAlignmentInput = {
  // The block's natural slot height (own height + gap to the next block), spacer excluded.
  naturalSlotHeight: number;
  // The comment's natural rendered content height beside the block (0 for an un-annotated slot).
  commentHeight: number;
};

export type BlockAlignment = {
  // Margin-side: the row's minimum height, so a short comment still fills its block's slot.
  minHeight: number;
  // Document-side: vertical space injected below the block so a tall comment pushes the next one down.
  spacer: number;
};

export const computeBlockAlignment = (
  blocks: readonly BlockAlignmentInput[],
  // Caps a single runaway comment so one very long expanded comment can't open an enormous gap.
  maxSpacer = Number.POSITIVE_INFINITY,
): BlockAlignment[] =>
  blocks.map(({ naturalSlotHeight, commentHeight }) => ({
    minHeight: Math.max(0, naturalSlotHeight),
    spacer: Math.min(maxSpacer, Math.max(0, commentHeight - Math.max(0, naturalSlotHeight))),
  }));

// Recover each block's natural slot height from measured geometry: the gap-inclusive distance to the
// next block's top, with the spacer we currently inject backed out (so the result is independent of
// the spacer and the apply pass converges). The last block has no successor, so its own height stands
// in (there is nothing below it to keep aligned).
export const naturalSlotHeights = (
  tops: readonly number[],
  heights: readonly number[],
  currentSpacers: readonly number[],
): number[] =>
  tops.map((top, index) => {
    const next = tops[index + 1];
    if (next === undefined) return Math.max(0, heights[index] ?? 0);
    return Math.max(0, next - top - (currentSpacers[index] ?? 0));
  });

// Two spacer arrays are equal when every entry matches within a sub-pixel epsilon — used to skip
// redundant editor dispatches and stop measurement jitter from oscillating.
export const spacersEqual = (
  a: readonly number[],
  b: readonly number[],
  epsilon = 0.5,
): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= epsilon);
};
