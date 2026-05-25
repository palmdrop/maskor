// Deterministic palette fallback for aspects without an explicit `color`.
// The palette is shared by the tile color bar and (next slice) the actual-arc
// curves so the two views agree on colors per aspect key.

export const ASPECT_COLOR_PALETTE = [
  "#f97316", // orange-500
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#eab308", // yellow-500
  "#06b6d4", // cyan-500
  "#ef4444", // red-500
  "#14b8a6", // teal-500
  "#8b5cf6", // violet-500
] as const;

const hashAspectKey = (aspectKey: string): number => {
  let hash = 5381;
  for (let i = 0; i < aspectKey.length; i++) {
    hash = (hash * 33) ^ aspectKey.charCodeAt(i);
  }
  return hash >>> 0;
};

export const resolveAspectColor = (
  aspectKey: string,
  explicitColor: string | undefined,
): string => {
  if (explicitColor) return explicitColor;
  return ASPECT_COLOR_PALETTE[hashAspectKey(aspectKey) % ASPECT_COLOR_PALETTE.length]!;
};
