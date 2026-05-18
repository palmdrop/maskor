import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";

interface TileContentProps {
  fragment: FragmentSummary;
  inSequence: boolean;
  violationTooltips?: string[];
  cycleTooltips?: string[];
  isSelected?: boolean;
}

export const TileContent = ({
  fragment,
  violationTooltips,
  cycleTooltips,
  isSelected,
}: TileContentProps) => (
  <div
    className={`relative rounded-md border bg-card p-3 flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden h-28 w-40 transition-colors ${
      isSelected ? "border-primary ring-1 ring-primary" : "border-border"
    }`}
  >
    <div className="absolute top-1.5 right-1.5 flex gap-0.5">
      {violationTooltips && violationTooltips.length > 0 && (
        <span
          className="text-amber-500"
          title={violationTooltips.join("\n")}
          aria-label={`Ordering violation: ${violationTooltips.join("; ")}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      )}
      {cycleTooltips && cycleTooltips.length > 0 && (
        <span
          className="text-red-500"
          title={cycleTooltips.join("\n")}
          aria-label={`Cycle: ${cycleTooltips.join("; ")}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
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
    <span className="text-xs font-semibold text-foreground truncate">{fragment.key}</span>
    <span className="text-xs text-muted-foreground leading-snug line-clamp-3">
      {fragment.excerpt ?? ""}
    </span>
  </div>
);
