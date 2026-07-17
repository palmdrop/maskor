import { useMemo } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { ArcPanel, ARC_PANEL_HEIGHT } from "./ArcPanel";
import { ArcLegend } from "./ArcLegend";
import { GraphSectionsBar } from "./GraphSectionsBar";
import { buildArcSeries } from "../utils/arcData";
import type { GraphSectionData } from "../utils/arcLayout";
import { computeArcXLayout, EXPANDED_PX_PER_FRAGMENT } from "../utils/arcLayout";
import { useElementWidth } from "../hooks/useElementWidth";
import { Heading } from "@components/heading";

interface ArcOverlayProps {
  sectionsData: GraphSectionData[];
  fragmentByUuid: Map<string, FragmentSummary>;
  colorByAspectKey: Map<string, string>;
  arcAspectKeys: string[];
  hiddenAspectKeys: Set<string>;
  onToggleAspectVisibility: (aspectKey: string) => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  // Fragments of the sidebar-hovered sequence — their points are emphasized.
  highlightedFragmentUuids: Set<string>;
  // The single fragment hovered in the reorder column or spine — soft emphasis.
  hoveredFragmentUuid: string | null;
}

// Summonable compressed horizontal multi-aspect arc graph rendered from
// `ArcPanel`, with the x-axis re-mapped from sequence index / fit-to-width (not
// tile centers). Expands into a larger, horizontally scrollable view.
export const ArcOverlay = ({
  sectionsData,
  fragmentByUuid,
  colorByAspectKey,
  arcAspectKeys,
  hiddenAspectKeys,
  onToggleAspectVisibility,
  isExpanded,
  onToggleExpanded,
  onClose,
  highlightedFragmentUuids,
  hoveredFragmentUuid,
}: ArcOverlayProps) => {
  const { ref, width: containerWidth } = useElementWidth();

  const orderedCount = useMemo(
    () => sectionsData.reduce((sum, section) => sum + section.fragmentUuids.length, 0),
    [sectionsData],
  );

  const fitWidth = Math.max(0, containerWidth);
  const arcWidth = isExpanded
    ? Math.max(fitWidth, orderedCount * EXPANDED_PX_PER_FRAGMENT)
    : fitWidth;

  // One layout pass feeds both the plotted series and the sections bar.
  const layout = useMemo(() => computeArcXLayout(sectionsData, arcWidth), [sectionsData, arcWidth]);

  const series = useMemo(() => {
    if (arcWidth <= 0) return [];
    const allSeries = buildArcSeries(
      layout.orderedFragmentUuids,
      fragmentByUuid,
      layout.centerByFragmentUuid,
      ARC_PANEL_HEIGHT,
    );
    return allSeries.filter((entry) => !hiddenAspectKeys.has(entry.aspectKey));
  }, [layout, arcWidth, fragmentByUuid, hiddenAspectKeys]);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-background/95 p-3"
      data-testid="arc-overlay"
    >
      <div className="flex items-center gap-2">
        <Heading level={4}>Aspect arcs</Heading>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-pressed={isExpanded}
            className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide aspect arcs"
            className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Hide
          </button>
        </div>
      </div>

      {arcAspectKeys.length > 0 && (
        <ArcLegend
          aspectKeys={arcAspectKeys}
          colorByAspectKey={colorByAspectKey}
          hiddenAspectKeys={hiddenAspectKeys}
          onToggle={onToggleAspectVisibility}
        />
      )}

      <div ref={ref} className={isExpanded ? "overflow-x-auto" : "overflow-x-hidden"}>
        {arcWidth > 0 && orderedCount > 0 ? (
          <div style={{ width: arcWidth }}>
            <ArcPanel
              width={arcWidth}
              series={series}
              colorByAspectKey={colorByAspectKey}
              highlightedFragmentUuids={highlightedFragmentUuids}
              hoveredFragmentUuid={hoveredFragmentUuid}
            />
            <GraphSectionsBar
              width={arcWidth}
              sectionBoundaries={layout.sectionBoundaries}
              testId="arc-sections-bar"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No placed fragments to plot.</p>
        )}
      </div>
    </div>
  );
};
