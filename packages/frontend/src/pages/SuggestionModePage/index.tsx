import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { FragmentEditor, type FragmentEditorHandle } from "../../components/fragments/fragment-editor";
import { Button } from "../../components/ui/button";
import { getNextSuggestion } from "../../api/suggestion";

const AVOIDANCE_NUDGE_THRESHOLD = 3;

export const SuggestionModePage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/suggestion" });
  const navigate = useNavigate();
  const editorRef = useRef<FragmentEditorHandle>(null);

  const [fragmentId, setFragmentId] = useState<string | null | undefined>(undefined);
  const [avoidanceCount, setAvoidanceCount] = useState(0);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Track dismissed nudges per fragment UUID — dismissed state survives Next navigation.
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());

  const loadNext = useCallback(
    async (excludeUuid?: string) => {
      setIsLoadingNext(true);
      setSaveError(null);
      try {
        const result = await getNextSuggestion(projectId, excludeUuid);
        if (result.status !== 200) {
          setSaveError("Failed to load next suggestion.");
          return;
        }
        const { fragment, avoidanceCount: count } = result.data;
        setFragmentId(fragment?.uuid ?? null);
        setAvoidanceCount(count);
      } catch {
        setSaveError("Failed to load next suggestion.");
      } finally {
        setIsLoadingNext(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadNext();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = useCallback(async () => {
    if (isLoadingNext) return;
    const currentFragmentId = fragmentId;
    if (editorRef.current) {
      try {
        await editorRef.current.save();
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "Save failed. Fix errors before continuing.",
        );
        return;
      }
    }
    await loadNext(currentFragmentId ?? undefined);
  }, [isLoadingNext, fragmentId, loadNext]);

  const handleExit = useCallback(() => {
    void navigate({ to: "/projects/$projectId/fragments", params: { projectId } });
  }, [navigate, projectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleExit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleExit, handleNext]);

  // fragmentId === undefined means initial load
  if (fragmentId === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (fragmentId === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium">All fragments are finished</p>
        <p className="text-muted-foreground text-sm">
          No fragments need work right now. Mark fragments as unfinished or lower their readyStatus
          to add them back to the pool.
        </p>
        <Button variant="outline" onClick={handleExit}>
          Back to fragments
        </Button>
      </div>
    );
  }

  const showNudge =
    avoidanceCount >= AVOIDANCE_NUDGE_THRESHOLD && !dismissedNudges.has(fragmentId);

  return (
    <div className="flex h-full flex-col">
      {saveError && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          <span className="text-destructive">{saveError}</span>
          <button
            className="shrink-0 text-destructive/70 hover:text-destructive transition-colors"
            onClick={() => setSaveError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={handleExit}>
          Exit
        </Button>
        <Button size="sm" disabled={isLoadingNext} onClick={() => void handleNext()}>
          {isLoadingNext ? "Loading…" : "Next"}
          <span className="ml-1 text-xs opacity-60">⌘↵</span>
        </Button>
      </div>
      {showNudge && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            You&apos;ve skipped this fragment a few times. Consider raising its readyStatus or
            discarding it.
          </span>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() =>
              setDismissedNudges((previous) => new Set([...previous, fragmentId]))
            }
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <FragmentEditor
          key={fragmentId}
          ref={editorRef}
          projectId={projectId}
          fragmentId={fragmentId}
          sidebarCollapsible
        />
      </div>
    </div>
  );
};
