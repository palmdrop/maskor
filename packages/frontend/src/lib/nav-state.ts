// Per-project view-state persistence. All state lives in localStorage under a
// predictable key scheme. Readers degrade gracefully on missing or malformed values.
//
// Key scheme: maskor:nav:{projectId}:{view}:{field}
//
// Views covered:
//   fragments  — fragmentId (last-opened fragment UUID)
//   overview   — sequence (UUID), scroll (px offset), selection (JSON array of UUIDs)
//   preview    — sequence (UUID), scroll (px offset)
//
// The Edit/suggestion page is intentionally excluded — its cursor lives in the
// vault DB because the suggestion algorithm is a server-side consumer.

const key = (projectId: string, view: string, field: string) =>
  `maskor:nav:${projectId}:${view}:${field}`;

// --- raw helpers ---

const readString = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const writeString = (storageKey: string, value: string) => {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // localStorage unavailable — view-state restore is best-effort
  }
};

const clearKey = (storageKey: string) => {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
};

// --- fragments ---

export const readLastFragment = (projectId: string): string | null =>
  readString(key(projectId, "fragments", "fragmentId"));

export const writeLastFragment = (projectId: string, fragmentId: string) =>
  writeString(key(projectId, "fragments", "fragmentId"), fragmentId);

export const clearLastFragment = (projectId: string) =>
  clearKey(key(projectId, "fragments", "fragmentId"));

// --- overview ---

export const readOverviewSequence = (projectId: string): string | null =>
  readString(key(projectId, "overview", "sequence"));

export const writeOverviewSequence = (projectId: string, sequenceId: string) =>
  writeString(key(projectId, "overview", "sequence"), sequenceId);

export const readOverviewSelection = (projectId: string): string[] => {
  try {
    const raw = localStorage.getItem(key(projectId, "overview", "selection"));
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
};

export const writeOverviewSelection = (projectId: string, selection: string[]) => {
  try {
    localStorage.setItem(key(projectId, "overview", "selection"), JSON.stringify(selection));
  } catch {
    // ignore
  }
};

// Scroll is handled by usePersistedScroll; expose the key so the hook gets a
// stable, project-scoped storage key.
export const overviewScrollKey = (projectId: string) => key(projectId, "overview", "scroll");

// The anchor (`#fragment-<uuid>`) the Overview last wrote in *this tab*, kept in
// sessionStorage so a leftover hash from an in-app click can be told apart from
// an externally-supplied deep link on load. A deep link (hash present but not
// authored here) wins over the remembered scroll; a leftover hash yields to it.
// See `resolveOverviewLoadScroll`.
export const readOverviewAuthoredAnchor = (projectId: string): string | null => {
  try {
    return sessionStorage.getItem(key(projectId, "overview", "authoredAnchor"));
  } catch {
    return null;
  }
};

export const writeOverviewAuthoredAnchor = (projectId: string, anchorId: string) => {
  try {
    sessionStorage.setItem(key(projectId, "overview", "authoredAnchor"), anchorId);
  } catch {
    // sessionStorage unavailable — deep-link reconciliation degrades to scroll-wins
  }
};

// --- preview ---

export const readPreviewSequence = (projectId: string): string | null =>
  readString(key(projectId, "preview", "sequence"));

export const writePreviewSequence = (projectId: string, sequenceId: string) =>
  writeString(key(projectId, "preview", "sequence"), sequenceId);

export const previewScrollKey = (projectId: string) => key(projectId, "preview", "scroll");

// --- resolveLastView ---
//
// Returns the target URL parameters to use when navigating to a given view.
// Called by both the navbar Links and the navigation:* commands so the logic
// is not duplicated.

export type ResolvedFragmentView = { kind: "fragment"; fragmentId: string } | { kind: "list" };

export type ResolvedOverviewView = {
  sequence: string | null;
};

export type ResolvedPreviewView = {
  sequence: string | null;
};

export const resolveLastFragmentView = (projectId: string): ResolvedFragmentView => {
  const fragmentId = readLastFragment(projectId);
  if (fragmentId) return { kind: "fragment", fragmentId };
  return { kind: "list" };
};

export const resolveLastOverviewView = (projectId: string): ResolvedOverviewView => ({
  sequence: readOverviewSequence(projectId),
});

export const resolveLastPreviewView = (projectId: string): ResolvedPreviewView => ({
  sequence: readPreviewSequence(projectId),
});
