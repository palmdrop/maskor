import { useMemo } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";

interface VerticalArcStripProps {
  orderedFragmentUuids: string[];
  fragmentByUuid: Map<string, FragmentSummary>;
  colorByAspectKey: Map<string, string>;
  hiddenAspectKeys: Set<string>;
  // Vertical pixels per fragment row in the strip.
  rowHeight?: number;
  // Strip width; aspect weight is mapped across it as horizontal deviation.
  width?: number;
}

type StripPoint = { x: number; y: number; fragmentUuid: string };

// Phase 1b inline vertical arc strip: a thin per-aspect glance strip aligned to
// fragment rows. Sequence position maps to the vertical axis (row index) and
// aspect weight maps to horizontal deviation. New lightweight SVG rendering —
// not an ArcPanel reuse — that respects aspect visibility from the ArcLegend.
export const VerticalArcStrip = ({
  orderedFragmentUuids,
  fragmentByUuid,
  colorByAspectKey,
  hiddenAspectKeys,
  rowHeight = 28,
  width = 56,
}: VerticalArcStripProps) => {
  const height = Math.max(rowHeight, orderedFragmentUuids.length * rowHeight);

  const seriesByAspect = useMemo(() => {
    const pointsByAspect = new Map<string, StripPoint[]>();
    orderedFragmentUuids.forEach((fragmentUuid, index) => {
      const fragment = fragmentByUuid.get(fragmentUuid);
      if (!fragment) return;
      const y = rowHeight * (index + 0.5);
      for (const [aspectKey, value] of Object.entries(fragment.aspects)) {
        if (value.weight === undefined) continue;
        if (hiddenAspectKeys.has(aspectKey)) continue;
        const clampedWeight = Math.max(0, Math.min(1, value.weight));
        const x = clampedWeight * width;
        const existing = pointsByAspect.get(aspectKey) ?? [];
        existing.push({ x, y, fragmentUuid });
        pointsByAspect.set(aspectKey, existing);
      }
    });
    return [...pointsByAspect.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [orderedFragmentUuids, fragmentByUuid, hiddenAspectKeys, rowHeight, width]);

  if (orderedFragmentUuids.length === 0) return null;

  return (
    <svg
      role="img"
      aria-label="Vertical aspect strip aligned to fragment rows"
      data-testid="vertical-arc-strip"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      {seriesByAspect.map(([aspectKey, points]) => {
        const color = colorByAspectKey.get(aspectKey) ?? "#94a3b8";
        const path = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
        return (
          <g key={aspectKey} data-aspect-key={aspectKey}>
            {points.length > 1 && (
              <polyline
                points={path}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeOpacity={0.8}
              />
            )}
            {points.map((point) => (
              <circle key={point.fragmentUuid} cx={point.x} cy={point.y} r={2} fill={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
};
