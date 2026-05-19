import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";

export type ArcPoint = { x: number; y: number; fragmentUuid: string };

export type ArcSeries = {
  aspectKey: string;
  points: ArcPoint[];
};

// Build per-aspect series from the placed fragments. Each aspect key with at
// least one weighted fragment yields a series.
//
// "No weight" means the aspect key is absent from fragment.aspects entirely —
// such fragments are skipped (not plotted as zero). An explicit weight: 0 is a
// valid point and is plotted at the floor of the panel; it is distinct from
// omission and must not be dropped.
//
// y is mapped from aspect weight (0..1) to pixel space: weight=1 → top of the
// panel (y=0), weight=0 → bottom (y=panelHeight). Out-of-range values are
// clamped. Coordinates are in the same pixel system as `centerByFragmentUuid`.
export const buildArcSeries = (
  orderedFragmentUuids: string[],
  fragmentByUuid: Map<string, FragmentSummary>,
  centerByFragmentUuid: Map<string, number>,
  panelHeight: number,
): ArcSeries[] => {
  const pointsByAspect = new Map<string, ArcPoint[]>();
  for (const fragmentUuid of orderedFragmentUuids) {
    const fragment = fragmentByUuid.get(fragmentUuid);
    if (!fragment) continue;
    const xCenter = centerByFragmentUuid.get(fragmentUuid);
    if (xCenter === undefined) continue;
    for (const [aspectKey, value] of Object.entries(fragment.aspects)) {
      const weight = value.weight;
      if (weight === undefined) continue;
      const clampedWeight = Math.max(0, Math.min(1, weight));
      const y = (1 - clampedWeight) * panelHeight;
      const existing = pointsByAspect.get(aspectKey) ?? [];
      existing.push({ x: xCenter, y, fragmentUuid });
      pointsByAspect.set(aspectKey, existing);
    }
  }

  return Array.from(pointsByAspect.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([aspectKey, points]) => ({ aspectKey, points }));
};

// Convert a list of points into a smoothed SVG path string using a Catmull-Rom
// spline (tension = 0.5, converted to cubic Beziers). For endpoints, we
// duplicate P0/P3 so the curve passes through the first and last points
// without extra "phantom" extrapolation.
//
// 0 points → empty string. 1 point → the caller renders a dot instead. 2+
// points → returns "M …" followed by one "C cp1 cp2 end" per segment.
export const catmullRomPath = (points: ArcPoint[]): string => {
  if (points.length < 2) return "";

  const segments: string[] = [`M ${formatNumber(points[0]!.x)} ${formatNumber(points[0]!.y)}`];

  for (let i = 0; i < points.length - 1; i++) {
    const previousPoint = points[Math.max(0, i - 1)]!;
    const currentPoint = points[i]!;
    const nextPoint = points[i + 1]!;
    const afterNextPoint = points[Math.min(points.length - 1, i + 2)]!;

    const control1x = currentPoint.x + (nextPoint.x - previousPoint.x) / 6;
    const control1y = currentPoint.y + (nextPoint.y - previousPoint.y) / 6;
    const control2x = nextPoint.x - (afterNextPoint.x - currentPoint.x) / 6;
    const control2y = nextPoint.y - (afterNextPoint.y - currentPoint.y) / 6;

    segments.push(
      `C ${formatNumber(control1x)} ${formatNumber(control1y)} ${formatNumber(control2x)} ${formatNumber(control2y)} ${formatNumber(nextPoint.x)} ${formatNumber(nextPoint.y)}`,
    );
  }

  return segments.join(" ");
};

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);
