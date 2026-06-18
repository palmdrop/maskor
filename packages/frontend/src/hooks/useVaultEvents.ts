import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { VAULT_SYNC_EVENT_TYPES } from "@maskor/shared";

// Maps each vault SSE event to the set of project-scoped query-key prefixes it can affect, so an
// unrelated change no longer refetches every query for the project (which, combined with the
// editor's content-sync, used to clobber the open editor's unsaved buffer — see
// specifications/fragment-editor.md). The mapping is deliberately a safe over-approximation:
// over-invalidation only costs a refetch (a no-op under structural sharing), while under-invalidation
// would leave a view stale. Cross-entity edits (e.g. an aspect rename rewriting fragment frontmatter)
// rewrite the referenced files, which emit their own per-entity events, so each event only needs to
// cover its own entity plus the queries that directly derive from it.
//
// Prefixes are matched against `queryKey[0]` (a URL-path string like
// `/projects/${id}/fragments/summaries`). `null` means "invalidate everything for the project".
//
// TODO: this map is hand-maintained and has no compile-time link to the route surface — a new
// project-scoped query family that derives from an existing entity (e.g. a fragment-derived view
// under a new path prefix) will silently not refetch on that entity's event until added here.
// Revisit whenever a new project-scoped query family is introduced.
const eventInvalidationPrefixes = (eventType: string): readonly string[] | null => {
  switch (eventType) {
    case "fragment:synced":
    case "fragment:deleted":
      // Fragment GET/list/summaries (+ per-fragment stats), sequence contents (excerpts) and
      // placement-derived violations/cycles, and project stats.
      return ["fragments", "sequences", "stats"];
    case "aspect:synced":
    case "aspect:deleted":
      // Aspect GET/list, fragments (arc colours + unknown-aspect references), project stats, and
      // the warnings list (UNKNOWN_ASPECT_KEY).
      return ["aspects", "fragments", "stats", "warnings"];
    case "note:synced":
    case "note:deleted":
      // Note GET/list, and aspects (which carry a notes list).
      return ["notes", "aspects"];
    case "reference:synced":
    case "reference:deleted":
      // Reference GET/list, and fragments (which attach references by name).
      return ["references", "fragments"];
    case "margin:synced":
    case "margin:deleted":
      return ["margins"];
    case "vault:warning":
      return ["warnings"];
    case "vault:restored":
    case "vault:reset":
      // The whole vault DB was replaced/re-derived — refetch everything for the project.
      return null;
    default:
      // Unknown event: fall back to the safe, broad invalidation.
      return null;
  }
};

export const useVaultEvents = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Relative path so the stream routes through the same `/api` proxy as every
    // other API call (`customFetch` → `/api${url}`). Hardcoding the host+port
    // silently breaks the live-update stream outside `localhost:3001`.
    const source = new EventSource(`/api/projects/${projectId}/events`);

    const projectPrefix = `/projects/${projectId}/`;

    const handlerFor = (eventType: string) => () => {
      const prefixes = eventInvalidationPrefixes(eventType);
      // Query keys are URL-path strings (e.g. `/projects/${projectId}/fragments`), so we match by
      // prefix with a predicate.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== "string" || !key.startsWith(projectPrefix)) return false;
          // null → invalidate every project-scoped query (e.g. vault:restored / vault:reset).
          if (prefixes === null) return true;
          return prefixes.some((prefix) => key.startsWith(`${projectPrefix}${prefix}`));
        },
      });
    };

    const handlers = VAULT_SYNC_EVENT_TYPES.map((type) => {
      const handler = handlerFor(type);
      source.addEventListener(type, handler);
      return [type, handler] as const;
    });

    return () => {
      for (const [type, handler] of handlers) {
        source.removeEventListener(type, handler);
      }
      source.close();
    };
  }, [projectId, queryClient]);
};
