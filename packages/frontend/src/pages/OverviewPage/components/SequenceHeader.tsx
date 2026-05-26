import type { Sequence } from "@api/generated/maskorAPI.schemas";
import type { OverviewDensity } from "../../../router";
import { Heading } from "@components/heading";

interface SequenceHeaderProps {
  sequence: Sequence | undefined;
  density: OverviewDensity;
  designateMainPending: boolean;
  onDesignateMain: () => void;
  onDensityChange: (density: OverviewDensity) => void;
}

export const SequenceHeader = ({
  sequence,
  density,
  designateMainPending,
  onDesignateMain,
  onDensityChange,
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
    <div
      role="group"
      aria-label="Tile density"
      className="ml-auto flex items-center rounded border border-border overflow-hidden"
    >
      {(["full", "compact", "mini"] as const).map((tier) => {
        const isActive = density === tier;
        return (
          <button
            key={tier}
            type="button"
            aria-pressed={isActive}
            onClick={() => onDensityChange(tier)}
            className={`text-xs px-2 py-1 capitalize transition-colors ${
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {tier}
          </button>
        );
      })}
    </div>
  </div>
);
