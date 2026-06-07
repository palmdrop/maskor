import { useEffect, type RefObject } from "react";

// Mirror the editor's scrollTop into the Margin column and back, in lockstep. A guard suppresses the
// echo so the two scrollers don't fight. Re-attaches when `ready` changes: on first render
// `getScrollElement()` returns null (the editor isn't laid out yet), so the listeners must attach once
// the editor has mounted and reported geometry.
export const useScrollSync = (
  getScrollElement: () => HTMLElement | null,
  columnScrollRef: RefObject<HTMLDivElement | null>,
  ready: unknown,
): void => {
  useEffect(() => {
    const editorScroll = getScrollElement();
    const columnScroll = columnScrollRef.current;
    if (!editorScroll || !columnScroll) return;
    let syncing = false;
    const sync = (from: HTMLElement, to: HTMLElement) => () => {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      syncing = false;
    };
    const onEditorScroll = sync(editorScroll, columnScroll);
    const onColumnScroll = sync(columnScroll, editorScroll);
    editorScroll.addEventListener("scroll", onEditorScroll, { passive: true });
    columnScroll.addEventListener("scroll", onColumnScroll, { passive: true });
    return () => {
      editorScroll.removeEventListener("scroll", onEditorScroll);
      columnScroll.removeEventListener("scroll", onColumnScroll);
    };
  }, [getScrollElement, columnScrollRef, ready]);
};
