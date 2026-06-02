# Suggestions

Running log of issues, surprises, and deferred work encountered during development. Add an item
when something is noticed but not immediately fixed.

---

- 2026-06-02 — **Margin panel: pixel-perfect block↔comment alignment deferred.** Phase 6 ships the
  side-by-side Margin panel with comments ordered to follow fragment block order, collapse/expand
  toggles, and click-to-reveal scroll correspondence. The spec's "expanded: alignment padding so
  each block and its comments sit vertically beside each other" (measuring block offsets in the
  editor and padding the shorter column) is **not** implemented — it requires measuring rendered
  block geometry in both TipTap and CM6 and reconciling with the comment list, which is a large,
  fragile piece of layout work. The current ordering + reveal affordance covers the correspondence
  need pragmatically. Revisit if the alignment padding proves necessary in use. (plan: margins.md
  Phase 6)
