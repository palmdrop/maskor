import { useMemo } from "react";
import { ArcPanel, ARC_PANEL_HEIGHT } from "./ArcPanel";
import { GraphSectionsBar } from "./GraphSectionsBar";
import { computeArcXLayout, EXPANDED_PX_PER_FRAGMENT } from "../utils/arcLayout";
import { computeRelativeContentLengths } from "../utils/relativeContentLengths";
import { buildLengthSeries, LENGTH_SERIES_KEY } from "../utils/lengthData";
import { useElementWidth } from "../hooks/useElementWidth";
import { Heading } from "@components/heading";

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

interface LengthOverlayProps {
  sectionsData: SectionData[];
  // Full body text per fragment (from the sequence-contents query). Fragments
  // whose content has not loaded are omitted from the line.
  contentByFragmentUuid: Map<string, string>;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
}

// The length line's fixed color — a single measure, so no per-aspect palette.
const LENGTH_LINE_COLOR = "#94a3b8";
const LENGTH_COLOR_MAP = new Map([[LENGTH_SERIES_KEY, LENGTH_LINE_COLOR]]);

// Summonable horizontal length graph, sibling to the aspect-arc overlay: one raw
// per-fragment line of content length (characters) normalized to the longest
// placed fragment, over the same sequence-index x-axis. Advisory only — it
// surfaces length variation (clusters of long fragments) without enforcing it.
// Reuses the arc rendering primitives (`ArcPanel`, `GraphSectionsBar`).
export const LengthOverlay = ({
  sectionsData,
  contentByFragmentUuid,
  isExpanded,
  onToggleExpanded,
  onClose,
}: LengthOverlayProps) => {
  const { ref, width: containerWidth } = useElementWidth();

  const orderedCount = useMemo(
    () => sectionsData.reduce((sum, section) => sum + section.fragmentUuids.length, 0),
    [sectionsData],
  );

  const fitWidth = Math.max(0, containerWidth);
  const graphWidth = isExpanded
    ? Math.max(fitWidth, orderedCount * EXPANDED_PX_PER_FRAGMENT)
    : fitWidth;

  const series = useMemo(() => {
    if (graphWidth <= 0) return [];
    const { orderedFragmentUuids, centerByFragmentUuid } = computeArcXLayout(
      sectionsData,
      graphWidth,
    );
    const relativeLengthByFragmentUuid = computeRelativeContentLengths(
      orderedFragmentUuids,
      contentByFragmentUuid,
    );
    return buildLengthSeries(
      orderedFragmentUuids,
      relativeLengthByFragmentUuid,
      centerByFragmentUuid,
      ARC_PANEL_HEIGHT,
    );
  }, [sectionsData, graphWidth, contentByFragmentUuid]);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-background/95 p-3"
      data-testid="length-overlay"
    >
      <div className="flex items-center gap-2">
        <Heading level={4}>Fragment length</Heading>
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
            aria-label="Hide fragment length"
            className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Hide
          </button>
        </div>
      </div>

      <div ref={ref} className={isExpanded ? "overflow-x-auto" : "overflow-x-hidden"}>
        {graphWidth > 0 && orderedCount > 0 ? (
          <div style={{ width: graphWidth }}>
            <ArcPanel
              width={graphWidth}
              series={series}
              colorByAspectKey={LENGTH_COLOR_MAP}
              ariaLabel="Fragment length across the placed sequence"
              testId="length-panel"
            />
            <GraphSectionsBar
              width={graphWidth}
              sectionsData={sectionsData}
              testId="length-sections-bar"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No placed fragments to plot.</p>
        )}
      </div>
    </div>
  );
};
