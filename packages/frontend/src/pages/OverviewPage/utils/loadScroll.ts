// Reconciles the two competing scroll sources when the Overview loads: the
// remembered scroll offset (usePersistedScroll) and the URL `#fragment-<uuid>`
// anchor. Rule:
//   - An anchor we did NOT author in this tab is an external deep link → scroll
//     to it, overriding the remembered scroll. (Anchor wins.)
//   - Otherwise (a leftover hash from our own click, or no hash) the remembered
//     scroll position wins.
// The authored-anchor record lives in sessionStorage (see lib/nav-state).

export type OverviewLoadScroll =
  | { kind: "anchor"; anchorId: string }
  | { kind: "scroll"; offset: number }
  | { kind: "none" };

export const resolveOverviewLoadScroll = (input: {
  activeAnchorId: string | null;
  authoredAnchor: string | null;
  persistedOffset: number | null;
}): OverviewLoadScroll => {
  const { activeAnchorId, authoredAnchor, persistedOffset } = input;
  if (activeAnchorId && activeAnchorId !== authoredAnchor) {
    return { kind: "anchor", anchorId: activeAnchorId };
  }
  if (persistedOffset !== null) return { kind: "scroll", offset: persistedOffset };
  return { kind: "none" };
};
