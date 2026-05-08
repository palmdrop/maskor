import type { Fragment } from "./generated/maskorAPI.schemas";
import { customFetch } from "./fetch";

export type SuggestionNextResponse = {
  fragment: Fragment | null;
  avoidanceCount: number;
};

type SuggestionNextEnvelope = { data: SuggestionNextResponse; status: 200 };

export const getNextSuggestion = (
  projectId: string,
  excludeUuid?: string,
): Promise<SuggestionNextEnvelope> => {
  const query = excludeUuid ? `?exclude=${encodeURIComponent(excludeUuid)}` : "";
  return customFetch<SuggestionNextEnvelope>(`/projects/${projectId}/suggestion/next${query}`, {
    method: "GET",
  });
};

export const recordFragmentVisit = (
  projectId: string,
  fragmentId: string,
): Promise<{ data: undefined; status: 204 }> =>
  customFetch(`/projects/${projectId}/suggestion/visit/${fragmentId}`, { method: "POST" });
