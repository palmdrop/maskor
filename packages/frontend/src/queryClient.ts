import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@api/errors";

const isClientError = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.statusCode >= 400 && error.statusCode < 500;

// throwOnError policy: route 5xx and transport/unknown failures to an error
// boundary (a server hiccup the user can retry); leave 4xx for inline handling
// (a client/state problem that won't self-heal on retry). Note: useSuspenseQuery
// always throws regardless, so this primarily governs classic useQuery.
export const shouldThrowToBoundary = (error: unknown): boolean => !isClientError(error);

// retry policy: don't retry 4xx (won't self-heal); retry server/transport
// failures once.
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (isClientError(error)) return false;
  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Non-zero so revisiting a view doesn't always re-pend; mutations still
      // invalidate explicitly where freshness matters.
      staleTime: 30_000,
      // Self-heal a stale/failed view when the window regains focus.
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
      throwOnError: shouldThrowToBoundary,
    },
  },
});
