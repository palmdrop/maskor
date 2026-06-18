import { useMemo } from "react";
import { useListSwaps } from "@api/generated/swap/swap";

// The set of fragment UUIDs that currently have an unsaved-content swap file.
// Drives the "unsaved changes" dot in fragment lists: a fragment is dirty if it
// carries a swap (edits that survived navigation and have not been saved/cleared).
// Refetches on window focus so the dot reconciles when the user returns from an
// editor in another tab. False positives are possible if an external (Obsidian)
// edit makes the server content match a lingering swap — acceptable for a hint.
export const useUnsavedFragmentUuids = (projectId: string): Set<string> => {
  const { data } = useListSwaps(projectId, {
    query: { refetchOnWindowFocus: true },
  });

  return useMemo(() => {
    if (data?.status !== 200) return new Set<string>();
    return new Set(
      data.data.entries
        .filter((entry) => entry.entityType === "fragment")
        .map((entry) => entry.entityUUID),
    );
  }, [data]);
};
