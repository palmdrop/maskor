import { QueryClient } from "@tanstack/react-query";

// A QueryClient for tests of components that read via useSuspenseQuery: seed the
// cache with setQueryData (below) so the hook resolves from cache without
// suspending; staleTime Infinity stops a background refetch from firing the
// (stubbed) fetch and, under suspense's forced throwOnError, throwing.
export const makeSuspenseQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

export type QuerySeed = readonly [queryKey: readonly unknown[], data: unknown];

export const seedQueries = (client: QueryClient, seeds: readonly QuerySeed[]) => {
  for (const [queryKey, data] of seeds) client.setQueryData(queryKey, data);
};
