import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// TODO: find way of sharing this across shared and frontend without strange issues
const VAULT_SYNC_EVENT_TYPES = [
  "fragment:synced",
  "fragment:deleted",
  "aspect:synced",
  "aspect:deleted",
  "note:synced",
  "note:deleted",
  "reference:synced",
  "reference:deleted",
  "margin:synced",
  "margin:deleted",
  "vault:restored",
  "vault:reset",
  "vault:warning",
];

export const useVaultEvents = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Relative path so the stream routes through the same `/api` proxy as every
    // other API call (`customFetch` → `/api${url}`). Hardcoding the host+port
    // silently breaks the live-update stream outside `localhost:3001`.
    const source = new EventSource(`/api/projects/${projectId}/events`);

    const handleEvent = (_event: MessageEvent) => {
      // Broad invalidation — refetches all queries for this project.
      // Query keys are URL-path strings (e.g. `/projects/${projectId}/fragments`),
      // so we use a predicate to match all queries scoped to this project.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith(`/projects/${projectId}/`);
        },
      });
    };

    for (const type of VAULT_SYNC_EVENT_TYPES) {
      source.addEventListener(type, handleEvent);
    }

    return () => {
      for (const type of VAULT_SYNC_EVENT_TYPES) {
        source.removeEventListener(type, handleEvent);
      }
      source.close();
    };
  }, [projectId, queryClient]);
};
