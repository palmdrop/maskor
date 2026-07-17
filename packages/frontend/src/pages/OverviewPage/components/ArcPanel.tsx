import type { ArcSeries } from "../utils/arcData";
import { catmullRomPath } from "../utils/arcData";

export const ARC_PANEL_HEIGHT = 140;
export const ARC_PANEL_TOP_PADDING = 12;
export const ARC_PANEL_BOTTOM_PADDING = 12;

interface ArcPanelProps {
  width: number;
  series: ArcSeries[];
  colorByAspectKey: Map<string, string>;
  // Accessible label + test id override so the shared panel can be reused for
  // non-aspect series (e.g. the length graph). Defaults describe the arc graph.
  ariaLabel?: string;
  testId?: string;
  // Fragments belonging to the sidebar-hovered sequence — their plotted points
  // are emphasized (enlarged dot + sky ring) so the hovered sequence's members
  // stand out across both graphs.
  highlightedFragmentUuids?: Set<string>;
  // The single fragment hovered in the reorder column or spine — its point gets
  // a softer emphasis (slightly enlarged, muted ring). The strong sequence
  // highlight above takes precedence when a point is both.
  hoveredFragmentUuid?: string | null;
}

// Sky ring matching the row/spine highlight, drawn around a strongly emphasized
// dot; a muted ring for the soft single-fragment hover.
const HIGHLIGHT_STROKE = "#38bdf8";
const SOFT_HOVER_STROKE = "#94a3b8";
const EMPTY_HIGHLIGHT_SET: Set<string> = new Set();

export const ArcPanel = ({
  width,
  series,
  colorByAspectKey,
  ariaLabel = "Aspect arcs across the placed sequence",
  testId = "arc-panel",
  highlightedFragmentUuids = EMPTY_HIGHLIGHT_SET,
  hoveredFragmentUuid = null,
}: ArcPanelProps) => {
  const panelHeight = ARC_PANEL_HEIGHT + ARC_PANEL_TOP_PADDING + ARC_PANEL_BOTTOM_PADDING;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="bg-background/95 backdrop-blur-sm border-b border-border"
      style={{ width, height: panelHeight }}
      data-testid={testId}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={panelHeight}
        viewBox={`0 0 ${width} ${panelHeight}`}
        preserveAspectRatio="none"
      >
        {/* horizontal grid lines at weight 0, 0.5, 1 */}
        {[0, 0.5, 1].map((weight) => {
          const y = ARC_PANEL_TOP_PADDING + (1 - weight) * ARC_PANEL_HEIGHT;
          return (
            <line
              key={weight}
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={weight === 0 || weight === 1 ? 0.12 : 0.06}
              strokeWidth={1}
              className="text-muted-foreground"
            />
          );
        })}

        {series.map(({ aspectKey, points }) => {
          const color = colorByAspectKey.get(aspectKey) ?? "#94a3b8";
          const offsetPoints = points.map((point) => ({
            ...point,
            y: point.y + ARC_PANEL_TOP_PADDING,
          }));
          if (offsetPoints.length === 1) {
            const single = offsetPoints[0]!;
            const highlighted = highlightedFragmentUuids.has(single.fragmentUuid);
            const softHovered = !highlighted && single.fragmentUuid === hoveredFragmentUuid;
            return (
              <circle
                key={aspectKey}
                cx={single.x}
                cy={single.y}
                r={highlighted ? 4.5 : softHovered ? 3.75 : 3}
                fill={color}
                stroke={
                  highlighted ? HIGHLIGHT_STROKE : softHovered ? SOFT_HOVER_STROKE : undefined
                }
                strokeWidth={highlighted ? 2 : softHovered ? 1.5 : undefined}
                data-aspect-key={aspectKey}
                data-highlighted={highlighted || undefined}
                data-soft-hovered={softHovered || undefined}
              />
            );
          }
          return (
            <g key={aspectKey} data-aspect-key={aspectKey}>
              <path
                d={catmullRomPath(offsetPoints)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {offsetPoints.map((point) => {
                const highlighted = highlightedFragmentUuids.has(point.fragmentUuid);
                const softHovered = !highlighted && point.fragmentUuid === hoveredFragmentUuid;
                return (
                  <circle
                    key={point.fragmentUuid}
                    cx={point.x}
                    cy={point.y}
                    r={highlighted ? 4.5 : softHovered ? 3.75 : 2.5}
                    fill={color}
                    stroke={
                      highlighted ? HIGHLIGHT_STROKE : softHovered ? SOFT_HOVER_STROKE : undefined
                    }
                    strokeWidth={highlighted ? 2 : softHovered ? 1.5 : undefined}
                    data-highlighted={highlighted || undefined}
                    data-soft-hovered={softHovered || undefined}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
