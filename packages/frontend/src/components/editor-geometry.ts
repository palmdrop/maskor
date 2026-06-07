import type { EditorView } from "@uiw/react-codemirror";
import type { Editor } from "@tiptap/react";
import { stripCommentMarkers } from "@maskor/shared";
import { blockRanges } from "@lib/margins/block-ranges";
import { cmAnchorBlockIndex } from "./anchor-cm";
import { tiptapAnchorBlockIndex } from "./anchor-tiptap";

// One block as the editor reports it (ADR 0009): its comment anchor (the first marker on the block,
// or null), the marker-stripped opening text, and its content-relative top/height in pixels. The
// editor — not the Margin — is the single source of block enumeration and geometry, so the Margin
// renders one row per entry in this order and anchors each comment at the block's `top`.
export type EditorBlock = {
  markerId: string | null;
  text: string;
  top: number;
  height: number;
};

// The marker id anchored to a given block index, or null — the first match in a markerId→blockIndex
// map (one comment per block; ADR 0008).
export const markerForBlock = (byBlock: Map<string, number>, index: number): string | null => {
  for (const [markerId, blockIndex] of byBlock) {
    if (blockIndex === index) return markerId;
  }
  return null;
};

// Block geometry for the raw/vim (CM6) editor. Uses the height map (`lineBlockAt`), not `coordsAtPos`:
// the latter returns null for positions outside the rendered viewport, so a long fragment's off-screen
// blocks would report zero geometry and the Margin would misalign. `lineBlockAt` is defined for every
// position; its tops are document-relative, and `documentTop` converts them to a scroll-independent
// offset from the scroller's content origin (so the Margin can anchor to them).
export const cmEditorBlocks = (view: EditorView): EditorBlock[] => {
  const scroller = view.scrollDOM;
  const docOffset = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const byBlock = cmAnchorBlockIndex(view.state);
  const docLength = view.state.doc.length;
  return blockRanges(view.state.doc.toString()).map((range, index) => {
    const raw = view.state.doc.sliceString(range.from, range.to);
    const markerId = markerForBlock(byBlock, index);
    const text = stripCommentMarkers(raw).trim();
    const first = view.lineBlockAt(Math.min(range.from, docLength));
    const last = view.lineBlockAt(Math.min(range.to, docLength));
    return {
      markerId,
      text,
      top: first.top + docOffset,
      height: Math.max(0, last.bottom - first.top),
    };
  });
};

// Block geometry for the rich (TipTap) editor: one entry per top-level node, measured from its DOM
// rect (ProseMirror does not virtualize, so every node has real geometry).
export const richEditorBlocks = (editor: Editor, scroller: HTMLElement | null): EditorBlock[] => {
  const contentOrigin = scroller ? scroller.getBoundingClientRect().top - scroller.scrollTop : 0;
  const byBlock = tiptapAnchorBlockIndex(editor.state);
  const blocks: EditorBlock[] = [];
  editor.state.doc.forEach((node, offset, childIndex) => {
    const markerId = markerForBlock(byBlock, childIndex);
    const text = stripCommentMarkers(node.textContent).trim();
    const dom = editor.view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      blocks.push({ markerId, text, top: rect.top - contentOrigin, height: rect.height });
    } else {
      blocks.push({ markerId, text, top: 0, height: 0 });
    }
  });
  return blocks;
};
