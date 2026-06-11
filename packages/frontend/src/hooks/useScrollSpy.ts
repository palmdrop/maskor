import { useCallback, useEffect, useState, type RefObject } from "react";

const ANCHOR_CLASS = "fragment-anchor";
const ANCHOR_ID_PREFIX = "fragment-";

export type AnchorTop = { id: string; top: number };

// Pure core of the scroll spy: given anchors in document order with their
// viewport-relative `top` offsets and a reading-line coordinate (same space),
// return the id of the *last* anchor at or above the line — the fragment
// currently occupying the reading position. Falls back to the first anchor when
// the view sits above all of them; null when there are none. Direction-agnostic:
// it depends only on positions, not on scroll events, so scrolling up and down
// resolve to the same answer for the same layout.
export const pickActiveAnchorId = (anchors: AnchorTop[], line: number): string | null => {
  if (anchors.length === 0) return null;
  let activeId = anchors[0]!.id;
  for (const anchor of anchors) {
    if (anchor.top <= line) activeId = anchor.id;
    else break;
  }
  return activeId;
};

type Args = {
  // The scroll container holding the `.fragment-anchor` sentinels.
  rootRef: RefObject<HTMLElement | null>;
  // Gate: only observe once the anchored content has rendered.
  enabled: boolean;
  // Reading line as a fraction (0..1) down from the top of the root viewport.
  lineRatio?: number;
  // Recompute when any of these change (content swaps, edit-mode toggles, ready).
  deps?: unknown[];
};

// Position-based scroll spy for the preview/import anchor sentinels. Returns the
// id (without the `fragment-` prefix) of the fragment at the reading line, by
// reading anchor positions on scroll (rAF-throttled) and once up front. Because
// a programmatic scroll restore also fires a `scroll` event, the active id
// resolves correctly after a reload, not only on user scroll.
export const useScrollSpy = ({
  rootRef,
  enabled,
  lineRatio = 0.35,
  deps = [],
}: Args): string | null => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const compute = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const line = rootRect.top + rootRect.height * lineRatio;
    const anchors = [...root.getElementsByClassName(ANCHOR_CLASS)]
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element.id.startsWith(ANCHOR_ID_PREFIX),
      )
      .map((element) => ({
        id: element.id.slice(ANCHOR_ID_PREFIX.length),
        top: element.getBoundingClientRect().top,
      }));
    const next = pickActiveAnchorId(anchors, line);
    if (next !== null) setActiveId(next);
  }, [rootRef, lineRatio]);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        compute();
      });
    };
    compute();
    root.addEventListener("scroll", schedule, { passive: true });
    return () => {
      root.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // `deps` lets callers recompute after content/edit-mode changes (the
    // react-hooks plugin is not enabled in this project, so no suppression
    // directive is needed for the spread).
  }, [enabled, rootRef, compute, ...deps]);

  return activeId;
};
