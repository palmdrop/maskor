import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// Every generated sequence query key is a single-element array holding a URL that
// begins with `/projects/<projectId>/sequences` — the list, the main sequence, an
// individual sequence, and a sequence's contents all share that prefix. A prefix
// predicate invalidates the whole family in one call, so a mutation with a
// cross-sequence side effect (e.g. discard, which unplaces a fragment from every
// sequence it sat in) refreshes the sidebar, overview, and any open sequence view
// together — no per-sequence key bookkeeping. Mirrors `useInvalidateActionLog`.
export const useInvalidateSequences = (projectId: string) => {
  const queryClient = useQueryClient();
  const sequencesPrefix = `/projects/${projectId}/sequences`;
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: (query) => {
          const firstKey = query.queryKey[0];
          return typeof firstKey === "string" && firstKey.startsWith(sequencesPrefix);
        },
      }),
    [queryClient, sequencesPrefix],
  );
};
