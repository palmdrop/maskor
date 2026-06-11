import { Button } from "@components/ui/button";
import type { EditorNavigation } from "./fragment-editor";

// Presentational Previous/Next pair for the fragment editor's navigation slot.
// Pure: it owns disabled/boundary rendering only — the verbs (save-then-advance
// and any side effects) live in each view's command behind onNext / onPrevious.
// Undefined hasNext / hasPrevious means enabled; pass `false` to disable at a
// boundary. isNavigating disables both and shows the Next button as loading.
export const EditorNavigationControls = ({
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  isNavigating,
}: EditorNavigation) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={isNavigating || hasPrevious === false}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <Button size="sm" disabled={isNavigating || hasNext === false} onClick={onNext}>
        {isNavigating ? "Loading…" : "Next"}
      </Button>
    </div>
  );
};
