interface FragmentLengthBarProps {
  // Content length as a fraction of the longest fragment in the sequence (0, 1].
  relativeLength: number;
  className?: string;
}

// Thin horizontal bar visualizing a fragment's content length relative to the
// longest fragment. Shared by the spine's title detail level and the placement
// arranger's rows so both surfaces draw the same length cue.
export const FragmentLengthBar = ({ relativeLength, className }: FragmentLengthBarProps) => (
  <div
    className={`h-1 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
    aria-hidden="true"
  >
    <div
      data-testid="fragment-length-bar"
      className="h-full rounded-full bg-muted-foreground/40"
      style={{ width: `${Math.max(relativeLength, 0.015) * 100}%` }}
    />
  </div>
);
