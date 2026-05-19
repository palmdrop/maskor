interface ArcLegendProps {
  aspectKeys: string[];
  colorByAspectKey: Map<string, string>;
  hiddenAspectKeys: Set<string>;
  onToggle: (aspectKey: string) => void;
}

export const ArcLegend = ({
  aspectKeys,
  colorByAspectKey,
  hiddenAspectKeys,
  onToggle,
}: ArcLegendProps) => {
  if (aspectKeys.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Aspect arc visibility"
      data-testid="arc-legend"
      className="flex flex-wrap items-center gap-1.5"
    >
      {aspectKeys.map((aspectKey) => {
        const isVisible = !hiddenAspectKeys.has(aspectKey);
        const color = colorByAspectKey.get(aspectKey) ?? "#94a3b8";
        return (
          <button
            key={aspectKey}
            type="button"
            aria-pressed={isVisible}
            data-aspect-key={aspectKey}
            onClick={() => onToggle(aspectKey)}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs transition-colors ${
              isVisible
                ? "border-border bg-card text-foreground"
                : "border-border/50 bg-transparent text-muted-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full"
              style={{
                backgroundColor: isVisible ? color : "transparent",
                outline: isVisible ? undefined : `1px solid ${color}`,
              }}
            />
            <span className="leading-none">{aspectKey}</span>
          </button>
        );
      })}
    </div>
  );
};
