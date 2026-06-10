import { EditorView } from "@uiw/react-codemirror";
import { stripCommentMarkers, splitCommentMarkers, insertCommentMarkers } from "@maskor/shared";
import { setCmAnchorsEffect, getCmAnchors, cmAnchorBlockIndex } from "./anchor-cm";
import { setHighlightedAnchorEffect } from "./anchor-highlight-cm";
import { blockRanges } from "@lib/margins/block-ranges";
import { cmEditorBlocks, markerForBlock, type EditorBlock } from "./editor-geometry";
import type { ProseEditorHandle, SelectionCapture } from "./prose-editor";

export type CodeMirrorProseAdapterDeps = {
  /** The live CodeMirror view, or null before it mounts. */
  getView: () => EditorView | null;
  /** The on-disk content, returned by `getContent` when no view exists yet. */
  getFallbackContent: () => string;
  /** Track a new doc so the guarded `value` prop stays equal to it (no @uiw replace-back). */
  setCmValue: (value: string) => void;
  /** Notify the host that an anchor-coordinated edit dirtied the buffer (`onChange`). */
  notifyChange: () => void;
};

// Append an anchor at a CM6 offset (block end) — a coordinated edit held as an anchor, not buffer
// text. The caller fires onChange so the fragment dirties and the marker re-emits on the next save.
const addCmAnchor = (view: EditorView, offset: number, markerId: string): void => {
  view.dispatch({
    effects: setCmAnchorsEffect.of([...getCmAnchors(view.state), { markerId, offset }]),
  });
};

/**
 * The CodeMirror (vim + raw markdown) backend behind `ProseEditorHandle`. A pure factory: it
 * closes over the injected `deps` (view accessor, content fallback, value setter, change notifier)
 * and never touches React — so it can be constructed against a bare `EditorView` in a test. The
 * buffer holds clean markdown; comment anchors live in the per-mode anchor store and are re-emitted
 * as `<!--c:ID-->` only on the way out (ADR 0009).
 */
export const createCodeMirrorProseAdapter = (
  deps: CodeMirrorProseAdapterDeps,
): ProseEditorHandle => {
  const { getView, getFallbackContent, setCmValue, notifyChange } = deps;

  return {
    getContent: () => {
      const view = getView();
      if (!view) return getFallbackContent();
      // Trailing-trim to match the vault's normalization (it stores `body.trim() + "\n"`), so the
      // saved form is idempotent. Anchors sit at block ends, before any trailing whitespace, so
      // their offsets are unaffected.
      const clean = view.state.doc.toString().trimEnd();
      return insertCommentMarkers(clean, getCmAnchors(view.state));
    },
    setContent: (value: string) => {
      const { clean, anchors } = splitCommentMarkers(value);
      const view = getView();
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: clean },
        effects: setCmAnchorsEffect.of(anchors),
      });
      setCmValue(clean);
    },
    getSelection: (): SelectionCapture => {
      const view = getView();
      if (!view) return { text: "", isEmpty: true };
      const { from, to } = view.state.selection.main;
      const raw = view.state.doc.sliceString(from, to);
      const text = raw.trim();
      return { text, isEmpty: text.length === 0 };
    },
    focus: () => {
      getView()?.focus();
    },
    getCurrentBlock: () => {
      const view = getView();
      if (!view) return null;
      const head = view.state.selection.main.head;
      const ranges = blockRanges(view.state.doc.toString());
      const found = ranges.findIndex((range) => head >= range.from && head <= range.to);
      const index = found === -1 ? Math.max(ranges.length - 1, 0) : found;
      const range = ranges[index];
      const text = range
        ? stripCommentMarkers(view.state.doc.sliceString(range.from, range.to)).trim()
        : "";
      const markerId = markerForBlock(cmAnchorBlockIndex(view.state), index);
      return { text, markerId, index };
    },
    addAnchorAtBlock: (blockIndex: number, markerId: string) => {
      const view = getView();
      if (!view) return;
      const range = blockRanges(view.state.doc.toString())[blockIndex];
      if (!range) return;
      addCmAnchor(view, range.to, markerId);
      notifyChange();
    },
    removeAnchor: (markerId: string) => {
      const view = getView();
      if (!view) return;
      const next = getCmAnchors(view.state).filter((anchor) => anchor.markerId !== markerId);
      view.dispatch({ effects: setCmAnchorsEffect.of(next) });
      notifyChange();
    },
    revealAnchor: (markerId: string) => {
      const view = getView();
      if (!view) return;
      const anchor = getCmAnchors(view.state).find((entry) => entry.markerId === markerId);
      if (anchor) {
        view.dispatch({ effects: EditorView.scrollIntoView(anchor.offset, { y: "center" }) });
      }
    },
    focusAnchorBlock: (markerId: string) => {
      const view = getView();
      if (!view) return;
      const anchor = getCmAnchors(view.state).find((entry) => entry.markerId === markerId);
      if (anchor) {
        view.focus();
        view.dispatch({
          selection: { anchor: anchor.offset },
          effects: EditorView.scrollIntoView(anchor.offset, { y: "center" }),
        });
      }
    },
    getScrollElement: (): HTMLElement | null => getView()?.scrollDOM ?? null,
    getBlocks: (): EditorBlock[] => {
      const view = getView();
      return view ? cmEditorBlocks(view) : [];
    },
    setHighlightedAnchor: (markerId: string | null) => {
      getView()?.dispatch({ effects: setHighlightedAnchorEffect.of(markerId) });
    },
  };
};
