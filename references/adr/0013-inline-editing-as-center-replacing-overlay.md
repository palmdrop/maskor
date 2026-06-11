# Inline fragment editing renders as a center-replacing editor overlay

**Status**: accepted (supersedes the inline approach in `0003-preview-anchor-sentinels` for *editing*; the sentinels remain, used for navigation/scroll anchors only)

## Context

The first inline-editing implementation (shipped 2026-06-08, `references/plans/preview-inline-fragment-editing.md`) edited a fragment *in place* inside the rendered surface: in Preview it split the assembled markdown around the edited fragment's anchor sentinel and rendered `ReadonlyProse(before)` → `InlineFragmentEditor` → `ReadonlyProse(after)`; in the Overview spine each `FragmentProse` chunk swapped its body for a minimal `InlineFragmentEditor`. This preserved literal in-context rendering but coupled editing to a live scroll container, which produced persistent scroll and scroll-restoration bugs (two read-only ProseMirror instances plus the editor in one scroller, a markdown re-parse per edit-open, fragile re-scroll on save).

## Decision

Inline editing in Overview and Preview now mounts the full `FragmentEditor` as a **center-replacing overlay**: the spine / assembled document unmounts while editing and the editor takes the center column (the view's own sidebars stay). On exit the host scrolls to the **top of the last-shown fragment**, so the reader lands roughly where they began. The split-markdown path, `splitAroundFragment`, and the minimal `InlineFragmentEditor` are removed; the anchor sentinels survive solely as navigation/scroll targets.

## Consequences

- The only thing lost is *literal* in-place rendering (text no longer reflows under a live document while editing) — accepted, because removing the live scroll container is what eliminates the scroll-restoration complexity that motivated the change.
- Inline editing now uses the same full editor everywhere (metadata sidebar available; Margin suppressed inline via `showMargin={false}`), rather than a separate minimal editor that drifted from the real one.
- This is distinct from **focus mode**: opening the editor over the spine/document does not hide chrome. Focus mode is an orthogonal, explicit, self-portalling presentation toggle.
