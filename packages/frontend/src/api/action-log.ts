import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./fetch";
import type { LogEntry } from "@maskor/shared";

type ActionLogEnvelope = { data: LogEntry[]; status: 200 };

const getActionLog = (projectId: string, limit: number): Promise<ActionLogEnvelope> =>
  customFetch<ActionLogEnvelope>(`/projects/${projectId}/action-log?limit=${limit}`, {
    method: "GET",
  });

export const getActionLogQueryKey = (projectId: string) => ["action-log", projectId];

// Hand-rolled query options (no orval entry for this endpoint) so the route
// loader can prefetch it and the History view can read it via useSuspenseQuery —
// the queryKey matches getActionLogQueryKey, so prefetch + read share a cache
// entry, and useInvalidateActionLog still targets it.
export const getActionLogQueryOptions = (projectId: string, limit = 50) => ({
  queryKey: getActionLogQueryKey(projectId),
  queryFn: () => getActionLog(projectId, limit),
});

export const useActionLog = (projectId: string, limit = 50) =>
  useQuery(getActionLogQueryOptions(projectId, limit));

export const useInvalidateActionLog = (projectId: string) => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getActionLogQueryKey(projectId) });
};
