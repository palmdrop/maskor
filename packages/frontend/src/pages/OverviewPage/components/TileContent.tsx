import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";

interface TileContentProps {
  fragment: FragmentSummary;
  inSequence: boolean;
  violationTooltips?: string[];
}

export const TileContent = ({ fragment, violationTooltips }: TileContentProps) => (
  <div className="relative rounded-md border border-border bg-card p-3 flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden h-28 w-40">
    {violationTooltips && violationTooltips.length > 0 && (
      <span
        className="absolute top-1.5 right-1.5 text-amber-500"
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
    <span className="text-xs font-semibold text-foreground truncate">{fragment.key}</span>
    <span className="text-xs text-muted-foreground leading-snug line-clamp-3">
      {fragment.excerpt ?? ""}
    </span>
  </div>
);
