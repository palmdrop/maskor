import { FileTextIcon } from "lucide-react";

// A minimal "you are here" indicator for the reading surfaces (preview / import):
// the key of the fragment currently at the reading line, shown in the sticky
// header so the writer always knows which fragment they are in — independent of
// whether fragment titles are rendered in the prose. Renders nothing when no
// fragment is active. Kept deliberately quiet (muted, truncating) so it reads as a
// location cue rather than a control.
export const ActiveFragmentLabel = ({ fragmentKey }: { fragmentKey?: string }) => {
  if (!fragmentKey) return null;
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      title={fragmentKey}
      aria-live="polite"
    >
      <FileTextIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{fragmentKey}</span>
    </span>
  );
};
