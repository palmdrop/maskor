import { anchorSentinel, ANCHOR_SENTINEL_PATTERN } from "@maskor/shared/sentinel";

// Split assembled markdown at the sentinel for `uuid` so the editing fragment's
// content can be replaced with an inline editor. The "before" region ends just
// before the fragment's sentinel; "after" starts at the next sentinel (hiding the
// fragment's assembled body + any injected title while editing). Both values are
// fed to separate ReadonlyProse instances flanking the InlineFragmentEditor.
//
// Returns `null` when the sentinel for `uuid` is not found — the double-click
// resolved outside any fragment (before the first anchor, or within an injected
// heading), which the caller should ignore.
export function splitAroundFragment(
  markdown: string,
  uuid: string,
): { before: string; after: string } | null {
  const sentinel = anchorSentinel(uuid);
  const sentinelIndex = markdown.indexOf(sentinel);
  if (sentinelIndex === -1) return null;

  const before = markdown.slice(0, sentinelIndex).trimEnd();
  const remainder = markdown.slice(sentinelIndex + sentinel.length);

  // The "after" region starts at the NEXT fragment sentinel so the editing
  // fragment's assembled body (titles, headings, content) is completely hidden
  // while the editor is open.
  const nextMatch = ANCHOR_SENTINEL_PATTERN.exec(remainder);
  const after = nextMatch ? remainder.slice(nextMatch.index) : "";

  return { before, after };
}
