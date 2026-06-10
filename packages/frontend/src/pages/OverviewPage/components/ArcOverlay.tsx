import { useState, useRef, useLayoutEffect, useMemo } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { ArcPanel, ARC_PANEL_HEIGHT } from "./ArcPanel";
import { ArcLegend } from "./ArcLegend";
import { buildArcSeries } from "../utils/arcData";
import { computeArcXLayout } from "../utils/arcLayout";
import { Heading } from "@components/heading";

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

interface ArcOverlayProps {
  sectionsData: SectionData[];
  fragmentByUuid: Map<string, FragmentSummary>;
  colorByAspectKey: Map<string, string>;
  arcAspectKeys: string[];
  hiddenAspectKeys: Set<string>;
  onToggleAspectVisibility: (aspectKey: string) => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
}

// Horizontal pixels allotted to each fragment when the overlay is expanded into
// its full zoomable/scrollable form. Compressed mode fits to the container.
const EXPANDED_PX_PER_FRAGMENT = 64;

// Measure the available width of an element so the compressed arc can fit to it.
const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

interface SectionsBarProps {
  width: number;
  sectionsData: SectionData[];
}

// Minimized sections bar beneath the graph: one segment per section spanning the
// same x-axis (sequence index) as the arc curves, so boundaries line up.
const SectionsBar = ({ width, sectionsData }: SectionsBarProps) => {
  const { sectionBoundaries } = useMemo(
    () => computeArcXLayout(sectionsData, width),
    [sectionsData, width],
  );

  return (
    <div
      className="relative h-5 mt-1"
      style={{ width }}
      data-testid="arc-sections-bar"
      aria-hidden="true"
    >
      {sectionBoundaries.map((boundary, index) => (
        <div
          key={boundary.uuid}
          className={`absolute top-0 bottom-0 border-l border-border overflow-hidden ${
            index % 2 === 0 ? "bg-muted/40" : "bg-muted/20"
          }`}
          style={{ left: boundary.startX, width: Math.max(0, boundary.endX - boundary.startX) }}
          title={boundary.name || "Untitled section"}
        >
          <span className="px-1 text-[10px] leading-5 text-muted-foreground truncate block">
            {boundary.name || "Untitled section"}
          </span>
        </div>
      ))}
    </div>
  );
};

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

  const series = useMemo(() => {
    if (arcWidth <= 0) return [];
    const { orderedFragmentUuids, centerByFragmentUuid } = computeArcXLayout(
      sectionsData,
      arcWidth,
    );
    const allSeries = buildArcSeries(
      orderedFragmentUuids,
      fragmentByUuid,
      centerByFragmentUuid,
      ARC_PANEL_HEIGHT,
    );
    return allSeries.filter((entry) => !hiddenAspectKeys.has(entry.aspectKey));
  }, [sectionsData, arcWidth, fragmentByUuid, hiddenAspectKeys]);

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
            <ArcPanel width={arcWidth} series={series} colorByAspectKey={colorByAspectKey} />
            <SectionsBar width={arcWidth} sectionsData={sectionsData} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No placed fragments to plot.</p>
        )}
      </div>
    </div>
  );
};
