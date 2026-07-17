import type { ArcSeries } from "./arcData";

// Fixed series key for the single length line. Not an aspect key — the length
// graph reuses the aspect-arc rendering primitives with one synthetic series.
export const LENGTH_SERIES_KEY = "length";

// Build the single length line for the length graph. Each placed fragment's
// content length — already normalized to the longest placed fragment as a
// fraction in (0, 1] by `computeRelativeContentLengths` — is mapped to panel y
// the same way aspect weight is: ratio=1 → top (y=0), ratio→0 → bottom.
//
// Fragments absent from `relativeLengthByFragmentUuid` (content not loaded yet)
// or from `centerByFragmentUuid` are skipped, not plotted as zero. Returns an
// empty array when no fragment yields a point, so the caller renders nothing.
export const buildLengthSeries = (
  orderedFragmentUuids: readonly string[],
  relativeLengthByFragmentUuid: ReadonlyMap<string, number>,
  centerByFragmentUuid: ReadonlyMap<string, number>,
  panelHeight: number,
): ArcSeries[] => {
  const points = [];
  for (const fragmentUuid of orderedFragmentUuids) {
    const ratio = relativeLengthByFragmentUuid.get(fragmentUuid);
    if (ratio === undefined) continue;
    const xCenter = centerByFragmentUuid.get(fragmentUuid);
    if (xCenter === undefined) continue;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    points.push({ x: xCenter, y: (1 - clampedRatio) * panelHeight, fragmentUuid });
  }

  if (points.length === 0) return [];
  return [{ aspectKey: LENGTH_SERIES_KEY, points }];
};
