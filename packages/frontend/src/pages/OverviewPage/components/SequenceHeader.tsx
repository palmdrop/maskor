import type { Sequence } from "@api/generated/maskorAPI.schemas";
import type { OverviewDetailLevel } from "../../../router";
import { Heading } from "@components/heading";

const DETAIL_LEVELS: ReadonlyArray<{ level: OverviewDetailLevel; label: string }> = [
  { level: "prose", label: "Prose" },
  { level: "excerpt", label: "Excerpt" },
  { level: "title", label: "Title" },
];

interface SequenceHeaderProps {
  sequence: Sequence | undefined;
  detailLevel: OverviewDetailLevel;
  designateMainPending: boolean;
  onDesignateMain: () => void;
  onSetDetailLevel: (detailLevel: OverviewDetailLevel) => void;
  arcOverlayOpen: boolean;
  onToggleArcOverlay: () => void;
  verticalStripOpen: boolean;
  onToggleVerticalStrip: () => void;
}

export const SequenceHeader = ({
  sequence,
  detailLevel,
  designateMainPending,
  onDesignateMain,
  onSetDetailLevel,
  arcOverlayOpen,
  onToggleArcOverlay,
  verticalStripOpen,
  onToggleVerticalStrip,
}: SequenceHeaderProps) => (
  <div className="flex items-center gap-3">
    <Heading level={1}>{sequence?.name ?? "Overview"}</Heading>
    {sequence && !sequence.isMain && (
      <button
        type="button"
        onClick={onDesignateMain}
        disabled={designateMainPending}
        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        Make main
      </button>
    )}
    {sequence?.isMain && (
      <span className="text-xs px-2 py-1 rounded border border-border text-muted-foreground">
        Main
      </span>
    )}

    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        aria-pressed={verticalStripOpen}
        onClick={onToggleVerticalStrip}
        className={`text-xs px-2 py-1 rounded border transition-colors ${
          verticalStripOpen
            ? "border-border bg-muted text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        Strip
      </button>
      <button
        type="button"
        aria-pressed={arcOverlayOpen}
        onClick={onToggleArcOverlay}
        className={`text-xs px-2 py-1 rounded border transition-colors ${
          arcOverlayOpen
            ? "border-border bg-muted text-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        Arcs
      </button>

      <div
        role="group"
        aria-label="Spine detail level"
        className="flex items-center rounded border border-border overflow-hidden"
      >
        {DETAIL_LEVELS.map(({ level, label }) => {
          const isActive = detailLevel === level;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSetDetailLevel(level)}
              className={`text-xs px-2 py-1 transition-colors ${
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
