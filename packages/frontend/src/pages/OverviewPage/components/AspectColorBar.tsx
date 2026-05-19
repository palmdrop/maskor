import type { FragmentSummaryAspects } from "@api/generated/maskorAPI.schemas";

interface AspectColorBarProps {
  aspects: FragmentSummaryAspects;
  colorByAspectKey: Map<string, string>;
  className?: string;
}

export const AspectColorBar = ({ aspects, colorByAspectKey, className }: AspectColorBarProps) => {
  const entries = Object.entries(aspects);
  if (entries.length === 0) {
    return <div className={`bg-muted ${className ?? ""}`} />;
  }

  const totalWeight = entries.reduce((sum, [, value]) => sum + Math.max(0, value.weight), 0);

  if (totalWeight <= 0) {
    return <div className={`bg-muted ${className ?? ""}`} />;
  }

  return (
    <div className={`flex w-full overflow-hidden ${className ?? ""}`}>
      {entries.map(([aspectKey, value]) => {
        const weight = Math.max(0, value.weight);
        if (weight <= 0) return null;
        const percent = (weight / totalWeight) * 100;
        const color = colorByAspectKey.get(aspectKey) ?? "#94a3b8";
        return (
          <div
            key={aspectKey}
            style={{ width: `${percent}%`, backgroundColor: color }}
            title={`${aspectKey}: ${weight.toFixed(2)}`}
            aria-label={`${aspectKey} weight ${weight.toFixed(2)}`}
            data-aspect-key={aspectKey}
          />
        );
      })}
    </div>
  );
};
