import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { EditorBlock } from "@components/prose-editor";
import { pixelArraysEqual } from "@lib/margins/alignment";

type Options = {
  // Pull the editor's authoritative, measured block list (ADR 0009) — the single source of block
  // enumeration and geometry. Re-pulled whenever the geometry tick bumps.
  getBlocks: () => EditorBlock[];
  // The active editor's scroll element, for content-height and the scroll-settle re-measure.
  getScrollElement: () => HTMLElement | null;
  // The column's own scroller, queried for per-row overflow detection.
  scrollRef: RefObject<HTMLDivElement | null>;
  // Re-pull triggers: the buffer text, the editor mode, and the prose font size all change geometry.
  fragmentContent: string;
  mode: string;
  fontSize: number;
  expandAll: boolean;
};

export type MarginGeometry = {
  // The editor's measured blocks, in document order (index === row/block index).
  editorBlocks: EditorBlock[];
  // The anchored rows container's height, kept equal to the editor's content height so the two columns
  // scroll in lockstep.
  contentHeight: number;
  // Block indices whose collapsed comment is taller than its block-height clip (an overflow cue).
  overflowingBlocks: number[];
};

// Owns the Margin column's geometry: when to re-pull the editor's measured block list, the total
// scrollable height (so the columns scroll together), and which collapsed rows overflow. The block
// geometry is virtualization-safe (the editor measures via the height map), so this only re-pulls on
// content/mode/font change, on resize, and once scrolling settles (to let CM6's estimated off-screen
// line heights refine as blocks are revealed).
export const useMarginGeometry = ({
  getBlocks,
  getScrollElement,
  scrollRef,
  fragmentContent,
  mode,
  fontSize,
  expandAll,
}: Options): MarginGeometry => {
  // Bumped after mount / content change / resize / scroll-settle to re-pull the measured geometry.
  const [geometryTick, setGeometryTick] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [overflowingBlocks, setOverflowingBlocks] = useState<number[]>([]);

  const editorBlocks = useMemo(
    () => getBlocks(),
    [getBlocks, fragmentContent, mode, fontSize, geometryTick],
  );

  const remeasure = useCallback(() => {
    setGeometryTick((tick) => tick + 1);
  }, []);

  // Re-pull on the next frame after content/mode/font settle.
  useEffect(() => {
    const id = requestAnimationFrame(remeasure);
    return () => cancelAnimationFrame(id);
  }, [remeasure, fragmentContent, mode, fontSize]);

  // Re-pull when the editor resizes (the scroll container's box changes).
  useEffect(() => {
    const editorScroll = getScrollElement();
    if (!editorScroll || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(editorScroll);
    return () => observer.disconnect();
  }, [getScrollElement, remeasure]);

  // Re-pull once scrolling pauses: the height map gives scroll-independent tops, but CM6 *estimates*
  // off-screen line heights and only measures them when revealed, so a far-off comment's top can be
  // slightly off until its block scrolls in. Debounced — not per frame (that would re-render the whole
  // column on every scroll tick). Scroll-position mirroring lives in `useScrollSync`.
  useEffect(() => {
    const editorScroll = getScrollElement();
    if (!editorScroll) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(remeasure, 150);
    };
    editorScroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      editorScroll.removeEventListener("scroll", onScroll);
    };
  }, [getScrollElement, remeasure, geometryTick]);

  // Match the editor's content height (so the columns scroll in lockstep) and detect collapsed-row
  // overflow.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const editorScroll = getScrollElement();
    const measuredHeight =
      editorScroll?.scrollHeight ??
      editorBlocks.reduce((max, block) => Math.max(max, block.top + block.height), 0);
    setContentHeight((previous) =>
      Math.abs(previous - measuredHeight) < 0.5 ? previous : measuredHeight,
    );
    const overflowing: number[] = [];
    editorBlocks.forEach((_, index) => {
      const node = scroll.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
      if (node && node.scrollHeight - node.clientHeight > 2) overflowing.push(index);
    });
    setOverflowingBlocks((previous) =>
      pixelArraysEqual(previous, overflowing) ? previous : overflowing,
    );
    // `expandAll` toggles a row's clip, so overflow must be re-evaluated when it changes.
  }, [editorBlocks, expandAll, getScrollElement, scrollRef]);

  return { editorBlocks, contentHeight, overflowingBlocks };
};
