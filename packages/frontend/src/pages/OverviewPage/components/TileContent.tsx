import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { OverviewDensity } from "../../../router";
import { TILE_DIMENSIONS_BY_DENSITY } from "../utils/layout";
import { AspectColorBar } from "./AspectColorBar";

interface TileContentProps {
  fragment: FragmentSummary;
  density: OverviewDensity;
  colorByAspectKey: Map<string, string>;
  violationTooltips?: string[];
  cycleTooltips?: string[];
  isSelected?: boolean;
}

const IndicatorIcons = ({
  violationTooltips,
  cycleTooltips,
}: {
  violationTooltips?: string[];
  cycleTooltips?: string[];
}) => (
  <div className="absolute top-1 right-1 flex gap-0.5 pointer-events-none">
    {violationTooltips && violationTooltips.length > 0 && (
      <span
        className="text-amber-500 pointer-events-auto"
        title={violationTooltips.join("\n")}
        aria-label={`Ordering violation: ${violationTooltips.join("; ")}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line
            x1="12"
            y1="9"
            x2="12"
            y2="13"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="17"
            x2="12.01"
            y2="17"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    )}
    {cycleTooltips && cycleTooltips.length > 0 && (
      <span
        className="text-red-500 pointer-events-auto"
        title={cycleTooltips.join("\n")}
        aria-label={`Cycle: ${cycleTooltips.join("; ")}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.5 2v6h-6" />
          <path d="M2.5 12A10 10 0 0 1 18.46 5.5L21.5 8" />
          <path d="M2.5 22v-6h6" />
          <path d="M21.5 12A10 10 0 0 1 5.54 18.5L2.5 16" />
          <line x1="12" y1="11" x2="12" y2="11.01" stroke="currentColor" strokeWidth="3" />
        </svg>
      </span>
    )}
  </div>
);

export const TileContent = ({
  fragment,
  density,
  colorByAspectKey,
  violationTooltips,
  cycleTooltips,
  isSelected,
}: TileContentProps) => {
  const aspectKeys = Object.keys(fragment.aspects);
  const containerSize = TILE_DIMENSIONS_BY_DENSITY[density].tileClass;
  const borderClass = isSelected ? "border-primary ring-1 ring-primary" : "border-border";

  if (density === "mini") {
    return (
      <div
        data-density="mini"
        className={`relative rounded-md border bg-card cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden transition-colors ${containerSize} ${borderClass}`}
        title={fragment.key}
        aria-label={fragment.key}
      >
        <AspectColorBar
          aspects={fragment.aspects}
          colorByAspectKey={colorByAspectKey}
          className="h-full"
        />
        <IndicatorIcons violationTooltips={violationTooltips} cycleTooltips={cycleTooltips} />
      </div>
    );
  }

  if (density === "compact") {
    return (
      <div
        data-density="compact"
        className={`relative rounded-md border bg-card flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden transition-colors ${containerSize} ${borderClass}`}
      >
        <IndicatorIcons violationTooltips={violationTooltips} cycleTooltips={cycleTooltips} />
        <span className="text-xs font-semibold text-foreground truncate">{fragment.key}</span>
        <AspectColorBar
          aspects={fragment.aspects}
          colorByAspectKey={colorByAspectKey}
          className="h-1.5 rounded-sm mt-auto"
        />
      </div>
    );
  }

  return (
    <div
      data-density="full"
      className={`relative rounded-md border bg-card flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden transition-colors ${containerSize} ${borderClass}`}
    >
      <IndicatorIcons violationTooltips={violationTooltips} cycleTooltips={cycleTooltips} />
      <span className="text-xs font-semibold text-foreground truncate">{fragment.key}</span>
      <span className="text-xs text-muted-foreground leading-snug line-clamp-2 flex-1">
        {fragment.excerpt ?? ""}
      </span>
      {aspectKeys.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {aspectKeys.slice(0, 4).map((aspectKey) => {
            const color = colorByAspectKey.get(aspectKey) ?? "#94a3b8";
            return (
              <span
                key={aspectKey}
                className="text-[10px] text-muted-foreground inline-flex items-center gap-1 leading-none"
                title={`${aspectKey}: ${fragment.aspects[aspectKey]?.weight.toFixed(2) ?? "0"}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-12">{aspectKey}</span>
              </span>
            );
          })}
          {aspectKeys.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{aspectKeys.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
};
