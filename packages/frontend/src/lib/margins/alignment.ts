// The Margin column is absolutely anchored: each comment is positioned at its block's measured top
// (from the editor's geometry), so there is no slot/spacer math — the only shared helper left is a
// sub-pixel array comparison used to skip redundant geometry state updates and stop measurement jitter
// from oscillating.
export const pixelArraysEqual = (
  a: readonly number[],
  b: readonly number[],
  epsilon = 0.5,
): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= epsilon);
};
