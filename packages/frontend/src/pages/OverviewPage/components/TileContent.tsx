import type { FragmentSummary } from "../../../api/generated/maskorAPI.schemas";

interface TileContentProps {
  fragment: FragmentSummary;
  inSequence: boolean;
}

export const TileContent = ({ fragment }: TileContentProps) => (
  <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0 overflow-hidden h-28 w-40">
    <span className="text-xs font-semibold text-foreground truncate">{fragment.key}</span>
    <span className="text-xs text-muted-foreground leading-snug line-clamp-3">
      {fragment.excerpt ?? ""}
    </span>
  </div>
);
