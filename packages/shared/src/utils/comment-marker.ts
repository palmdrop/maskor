// Anchor markers bind a Margin comment to a fragment block. The marker is a namespaced HTML
// comment trailing the block: `<!--c:ID-->`. It is invisible in rendered markdown (Obsidian,
// GitHub, export preview) and Maskor-owned via the `c:` namespace, so it never collides with
// prose or genuine Obsidian block-refs. These helpers are shared by storage, the editors, and
// the export/preview assembly path — keep them browser-safe (no Node built-ins).

// Marker ids are url-safe: alphanumerics, hyphen, underscore. Matches what `createCommentMarkerId`
// produces and what an externally-authored marker may legibly contain. Exported so the editors and
// storage mappers build their own anchored regexes from the single source rather than re-hardcoding
// the class (which would drift).
export const MARKER_ID_CHAR_CLASS = "A-Za-z0-9_-";

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

// The unique set of marker ids present in some text. The single definition of "which comments are
// anchored in this fragment body," shared by the storage service and the watcher so the two derive
// orphan state identically (they read the body through different layers — parsed vs raw — but agree on
// the marker set).
export const markerIdSet = (text: string): Set<string> => new Set(extractCommentMarkerIds(text));

// A comment's excerpt is the *opening* of its anchored block, capped to keep the Margin honest and
// compact (ADR 0008). The cap is short by design — it is display context, not the body.
export const EXCERPT_MAX_LENGTH = 80;

// Collapse a block's text into a single-line opening excerpt: strip anchor markers, collapse runs of
// whitespace to single spaces, trim, and cap at `maxLength` with an ellipsis. Shared by the live
// display derivation (frontend) and the refresh-on-save persistence (storage) so both produce
// byte-identical excerpts.
export const deriveExcerpt = (blockText: string, maxLength = EXCERPT_MAX_LENGTH): string => {
  const cleaned = stripCommentMarkers(blockText).replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}…`;
};

// The opening excerpt of the block (blank-line-separated paragraph) that carries `markerId` in
// `content`, or null when the marker is absent (the comment is orphaned). Used to refresh a stored
// excerpt on fragment save and to live-derive the display excerpt from the open fragment buffer.
export const extractBlockOpening = (
  content: string,
  markerId: string,
  maxLength = EXCERPT_MAX_LENGTH,
): string | null => {
  const marker = buildCommentMarker(markerId);
  const block = content.split(/\n[ \t]*\n/).find((candidate) => candidate.includes(marker));
  if (block === undefined) return null;
  return deriveExcerpt(block, maxLength);
};

// Remove every `<!--c:ID-->` marker (and any horizontal whitespace immediately before it) from the
// text. Used by the export/preview assembly path so assembled output carries no markers, and by any
// caller that needs the marker-free prose.
export const stripCommentMarkers = (text: string): string => text.replace(COMMENT_MARKER_REGEX, "");

// Remove only the named marker (and any horizontal whitespace immediately before it), leaving every
// other marker intact. Backs the delete-comment coordinated edit: removing one comment strips its
// anchor from the fragment buffer without touching its siblings.
export const stripCommentMarker = (text: string, markerId: string): string => {
  const escaped = buildCommentMarker(markerId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`[ \\t]*${escaped}`, "g"), "");
};

// A comment anchor recovered from (or to be written into) on-disk content: the marker id and the
// character offset in the *clean* (marker-free) text where the marker sits. The editor holds markers
// out of its live buffer (ADR 0009) — they are stripped on load (recording these offsets, then mapped
// live by the editor) and re-emitted on save. This pair backs the raw/vim (CM6) path; the rich
// (TipTap) path uses ProseMirror node positions instead.
export type ParsedAnchor = { markerId: string; offset: number };

// Strip every `<!--c:ID-->` token from `content` (only the token — leading whitespace is preserved so
// re-emission is byte-stable), returning the clean text and each marker's offset into that clean
// text. `insertCommentMarkers` is its exact inverse for a given anchor set.
export const splitCommentMarkers = (
  content: string,
): { clean: string; anchors: ParsedAnchor[] } => {
  const regex = createCommentMarkerTokenRegex();
  const anchors: ParsedAnchor[] = [];
  let clean = "";
  let lastIndex = 0;
  for (const match of content.matchAll(regex)) {
    clean += content.slice(lastIndex, match.index);
    if (match[1]) anchors.push({ markerId: match[1], offset: clean.length });
    lastIndex = match.index + match[0].length;
  }
  clean += content.slice(lastIndex);
  return { clean, anchors };
};

// Re-emit markers into clean text at the given offsets — the inverse of `splitCommentMarkers`. Offsets
// are clamped into range and applied in order so the result is well-formed even if an anchor drifted.
export const insertCommentMarkers = (clean: string, anchors: readonly ParsedAnchor[]): string => {
  const sorted = [...anchors].sort((a, b) => a.offset - b.offset);
  let result = "";
  let last = 0;
  for (const anchor of sorted) {
    const offset = Math.max(0, Math.min(anchor.offset, clean.length));
    if (offset < last) continue;
    result += clean.slice(last, offset) + buildCommentMarker(anchor.markerId);
    last = offset;
  }
  result += clean.slice(last);
  return result;
};
