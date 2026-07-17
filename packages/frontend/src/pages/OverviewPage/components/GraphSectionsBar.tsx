import type { ArcSectionBoundary } from "../utils/arcLayout";

interface GraphSectionsBarProps {
  width: number;
  // Section spans on the same x-axis as the graph curves, computed once by the
  // overlay (via `computeArcXLayout`) and shared with the plotted series so the
  // layout is not recomputed here.
  sectionBoundaries: ArcSectionBoundary[];
  testId: string;
}

// Minimized sections bar beneath a sequence graph: one segment per section
// spanning the same sequence-index x-axis as the graph curves, so boundaries
// line up. Shared by the arc and length overlays.
export const GraphSectionsBar = ({ width, sectionBoundaries, testId }: GraphSectionsBarProps) => (
  <div className="relative h-5 mt-1" style={{ width }} data-testid={testId} aria-hidden="true">
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
