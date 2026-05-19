import type { ArcSeries } from "../utils/arcData";
import { catmullRomPath } from "../utils/arcData";

export const ARC_PANEL_HEIGHT = 140;
export const ARC_PANEL_TOP_PADDING = 12;
export const ARC_PANEL_BOTTOM_PADDING = 12;

interface ArcPanelProps {
  width: number;
  series: ArcSeries[];
  colorByAspectKey: Map<string, string>;
}

export const ArcPanel = ({ width, series, colorByAspectKey }: ArcPanelProps) => {
  const panelHeight = ARC_PANEL_HEIGHT + ARC_PANEL_TOP_PADDING + ARC_PANEL_BOTTOM_PADDING;

  return (
    <div
      role="img"
      aria-label="Aspect arcs across the placed sequence"
      className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border"
      style={{ width, height: panelHeight }}
      data-testid="arc-panel"
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
            return (
              <circle
                key={aspectKey}
                cx={single.x}
                cy={single.y}
                r={3}
                fill={color}
                data-aspect-key={aspectKey}
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
              {offsetPoints.map((point) => (
                <circle
                  key={point.fragmentUuid}
                  cx={point.x}
                  cy={point.y}
                  r={2.5}
                  fill={color}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
