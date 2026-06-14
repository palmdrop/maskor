import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FragmentEditor, type FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { suggestionModeScope } from "@lib/commands/scopes/suggestion-mode";
import {
  GetNextSuggestion,
  useGetCurrentSuggestion,
  getGetCurrentSuggestionQueryKey,
  useSetCurrentSuggestion,
} from "../../api/generated/suggestion/suggestion";

// TODO: this should be configured globally and not in a random FE-component
const AVOIDANCE_NUDGE_THRESHOLD = 3;

export const SuggestionModePage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/suggestion" });
  const { fragment: fragmentId } = useSearch({ from: "/projects/$projectId/suggestion" });
  const navigate = useNavigate({ from: "/projects/$projectId/suggestion" });
  const router = useRouter();
  const queryClient = useQueryClient();
  const current = useGetCurrentSuggestion(projectId);

  const editorRef = useRef<FragmentEditorHandle>(null);

  const setCurrentMutation = useSetCurrentSuggestion();

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
        const result = await GetNextSuggestion(
          projectId,
          excludeUuid ? { exclude: excludeUuid } : undefined,
        );
        if (result.status !== 200) {
          setSaveError("Failed to load next suggestion.");
          return;
        }

        await queryClient.invalidateQueries({
          queryKey: getGetCurrentSuggestionQueryKey(projectId),
        });

        const { fragment, avoidanceCount: count } = result.data;
        setAvoidanceCount(count);
        navigate({ search: { fragment: fragment?.uuid } });
      } catch {
        setSaveError("Failed to load next suggestion.");
      } finally {
        setIsLoadingNext(false);
      }
    },
    [projectId],
  );

  const setCurrentMutate = setCurrentMutation.mutate;

  // Keep the DB pointer in sync with the displayed fragment. Necessary when the
  // user navigates via browser history (Previous button) — loadNext already
  // updates the pointer, but going back doesn't. Without this, returning to
  // suggestion mode via the nav link would land on the most-recently-nexted
  // fragment instead of the one the user was on when they left.
  useEffect(() => {
    if (!fragmentId || isLoadingNext) {
      return;
    }
    setCurrentMutate({ projectId, data: { fragmentId } });
  }, [fragmentId, isLoadingNext, projectId, setCurrentMutate]);

  useEffect(() => {
    if (current.isLoading || isLoadingNext || fragmentId) {
      return;
    }

    const currentFragmentId =
      fragmentId ?? (current.data?.status === 200 ? current.data.data.fragment?.uuid : undefined);

    if (currentFragmentId) {
      navigate({ search: { fragment: currentFragmentId } });
      return;
    }

    void loadNext();

    // Only run on mount
  }, [current, fragmentId, isLoadingNext]);

  const goBack = useCallback(() => {
    router.history.back();
  }, [router]);

  const commands = useCommands();
  useCommandScope(suggestionModeScope, {
    fragmentId: fragmentId ?? null,
    editorRef,
    isLoading: isLoadingNext,
    hasPrevious: router.history.canGoBack(),
    loadNext,
    goBack,
    setSaveError,
  });

  // fragmentId === undefined means initial load
  if (fragmentId === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // TODO: no distinction between undefined and null anymore
  if (fragmentId === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium">All fragments are finished</p>
        <p className="text-muted-foreground text-sm">
          No fragments need work right now. Mark fragments as unfinished or lower their readiness to
          add them back to the pool.
        </p>
        <Link to="/projects/$projectId/fragments" params={{ projectId }}>
          Back to fragments
        </Link>
      </div>
    );
  }

  const showNudge = avoidanceCount >= AVOIDANCE_NUDGE_THRESHOLD && !dismissedNudges.has(fragmentId);

  // Navigation (Previous/Next) is now an editor capability — see the `navigation`
  // prop below. customizeExtraActions keeps only suggestion-specific chrome (the
  // save-error banner).
  const saveErrorBanner = saveError ? (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
      <span className="text-destructive">{saveError}</span>
      <button
        className="shrink-0 text-destructive/70 hover:text-destructive transition-colors"
        onClick={() => setSaveError(null)}
      >
        Dismiss
      </button>
    </div>
  ) : null;

  return (
    <div className="flex h-full flex-col">
      {showNudge && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            You&apos;ve skipped this fragment a few times. Consider raising its readiness or
            discarding it.
          </span>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setDismissedNudges((previous) => new Set([...previous, fragmentId]))}
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
          onDiscarded={loadNext}
          sidebarCollapsible
          navigation={{
            onPrevious: () => commands.run("suggestion:previous"),
            onNext: () => commands.run("suggestion:next"),
            hasPrevious: router.history.canGoBack(),
            // Suggestion's pool is non-deterministic — there is always a next.
            hasNext: true,
            isNavigating: isLoadingNext,
          }}
          customizeExtraActions={(defaultExtraActions) => (
            <>
              {saveErrorBanner}
              {defaultExtraActions}
            </>
          )}
        />
      </div>
    </div>
  );
};
