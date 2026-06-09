import { QueryClient, QueryCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiRequestError } from "@api/errors";

const isClientError = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.statusCode >= 400 && error.statusCode < 500;

const isServerOrTransportError = (error: unknown): boolean => !isClientError(error);

// throwOnError policy: route 5xx and transport/unknown failures to an error
// boundary (a server hiccup the user can retry); leave 4xx for inline handling
// (a client/state problem that won't self-heal on retry). Crucially, only throw
// when the view has no data to show yet (initial load) — a failed *background*
// revalidation of already-rendered data must NOT tear the view down; that case
// is surfaced subtly via the QueryCache onError toast below. Note:
// useSuspenseQuery always throws on an empty cache regardless of this.
export const shouldThrowToBoundary = (error: unknown, hasData: boolean): boolean =>
  isServerOrTransportError(error) && !hasData;

// retry policy: don't retry 4xx (won't self-heal); retry server/transport
// failures once.
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (isClientError(error)) return false;
  return failureCount < 1;
};

// A background-refetch failure is one where the query already holds data (so it
// wasn't routed to the boundary) and the failure is a server/transport hiccup
// (4xx of a populated query is rare and not actionable by the user here).
export const isBackgroundRefetchFailure = (error: unknown, hasData: boolean): boolean =>
  hasData && isServerOrTransportError(error);

export const queryCache = new QueryCache({
  onError: (error, query) => {
    if (isBackgroundRefetchFailure(error, query.state.data !== undefined)) {
      // Subtle, non-destructive: the stale data stays on screen.
      toast.error("Couldn’t refresh — showing the last loaded data.", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      // Non-zero so revisiting a view doesn't always re-pend; mutations still
      // invalidate explicitly where freshness matters.
      staleTime: 30_000,
      // Self-heal a stale/failed view when the window regains focus.
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
      throwOnError: (error, query) => shouldThrowToBoundary(error, query.state.data !== undefined),
    },
  },
});
