// Anchor markers bind a Margin comment to a fragment block. The marker is a namespaced HTML
// comment trailing the block: `<!--c:ID-->`. It is invisible in rendered markdown (Obsidian,
// GitHub, export preview) and Maskor-owned via the `c:` namespace, so it never collides with
// prose or genuine Obsidian block-refs. These helpers are shared by storage, the editors, and
// the export/preview assembly path — keep them browser-safe (no Node built-ins).

// Marker ids are url-safe: alphanumerics, hyphen, underscore. Matches what `createCommentMarkerId`
// produces and what an externally-authored marker may legibly contain.
const MARKER_ID_CHAR_CLASS = "A-Za-z0-9_-";

// Global matcher for a single marker, optionally preceded by horizontal whitespace. Capturing the
// leading whitespace lets the strip helper remove a trailing-space-plus-marker cleanly, leaving no
// dangling space behind the block.
export const COMMENT_MARKER_REGEX = new RegExp(`[ \\t]*<!--c:([${MARKER_ID_CHAR_CLASS}]+)-->`, "g");

export const buildCommentMarker = (markerId: string): string => `<!--c:${markerId}-->`;

// A fresh global regex matching the bare marker token (no surrounding whitespace), with the id
// captured. Returned fresh each call so callers never share `lastIndex` state. Used by the editors
// to locate exact marker bounds for hiding/parsing (the strip helper above eats leading whitespace,
// which is wrong for in-place editor decorations).
export const createCommentMarkerTokenRegex = (): RegExp =>
  new RegExp(`<!--c:([${MARKER_ID_CHAR_CLASS}]+)-->`, "g");

// Mint a new marker id. Short, url-safe, collision-resistant enough for per-fragment comment counts.
export const createCommentMarkerId = (): string =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// Every marker id present in the text, in document order. Duplicates are returned as-is so callers
// can detect (and a higher layer can warn about) a marker repeated by an external edit.
export const extractCommentMarkerIds = (text: string): string[] => {
  const ids: string[] = [];
  for (const match of text.matchAll(COMMENT_MARKER_REGEX)) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
};

export const hasCommentMarker = (text: string, markerId: string): boolean =>
  extractCommentMarkerIds(text).includes(markerId);

// Remove every `<!--c:ID-->` marker (and any horizontal whitespace immediately before it) from the
// text. Used by the export/preview assembly path so assembled output carries no markers, and by any
// caller that needs the marker-free prose.
export const stripCommentMarkers = (text: string): string => text.replace(COMMENT_MARKER_REGEX, "");
