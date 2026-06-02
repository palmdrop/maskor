import { extractBlockOpening } from "@maskor/shared";

// Live display excerpts derived from the open fragment buffer, keyed by marker id. Only markers
// present in the buffer (anchored) get an entry; orphaned comments have no live block, so callers
// fall back to the comment's frozen stored excerpt. (ADR 0008: the excerpt is derived live from the
// marker's current block, never from a cached snapshot — so a comment shows its block's current
// opening without any file churn.)
export const deriveLiveExcerpts = (
  fragmentContent: string,
  markerIds: readonly string[],
): Record<string, string> => {
  const excerpts: Record<string, string> = {};
  for (const markerId of markerIds) {
    const opening = extractBlockOpening(fragmentContent, markerId);
    if (opening !== null) excerpts[markerId] = opening;
  }
  return excerpts;
};
