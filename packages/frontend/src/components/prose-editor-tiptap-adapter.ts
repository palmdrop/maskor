import type { Editor } from "@tiptap/react";
import { stripCommentMarkers } from "@maskor/shared";
import {
  tiptapAnchorKey,
  tiptapAnchorBlockIndex,
  extractTiptapAnchors,
  serializeTiptapWithMarkers,
} from "./anchor-tiptap";
import { richEditorBlocks, markerForBlock, type EditorBlock } from "./editor-geometry";
import type { ProseEditorHandle, SelectionCapture } from "./prose-editor";

type MarkdownStorage = {
  markdown: {
    getMarkdown: () => string;
    serializer: { serialize: (content: unknown) => string };
  };
};

export type TiptapProseAdapterDeps = {
  /** The live TipTap editor, or null before it mounts. */
  getEditor: () => Editor | null;
  /** The on-disk content, returned by `getContent` when no editor exists yet. */
  getFallbackContent: () => string;
  /** The rich-mode scroll container, for scroll-sync and block geometry. */
  getScroller: () => HTMLElement | null;
  /** Guard the marker-stripping load transaction so it doesn't dirty the buffer. */
  setLoading: (loading: boolean) => void;
  /** Notify the host that an anchor-coordinated edit dirtied the buffer (`onChange`). */
  notifyChange: () => void;
};

// Append an anchor at a ProseMirror position (block end). Coordinated-edit semantics: held as an
// anchor, not buffer text; the caller fires onChange so the fragment dirties and the marker
// re-emits on the next save.
const addTiptapAnchor = (editor: Editor, pos: number, markerId: string): void => {
  const current = tiptapAnchorKey.getState(editor.state) ?? [];
  editor.view.dispatch(editor.state.tr.setMeta(tiptapAnchorKey, [...current, { markerId, pos }]));
};

/**
 * The TipTap (rich) backend behind `ProseEditorHandle`. A pure factory: it closes over the injected
 * `deps` (editor accessor, content fallback, scroller, load guard, change notifier) and never
 * touches React — so it can be constructed against a bare TipTap `Editor` in a test. The buffer
 * holds clean markdown; comment anchors live in the editor's anchor plugin and re-emit as
 * `<!--c:ID-->` only on serialize (ADR 0009).
 */
export const createTiptapProseAdapter = (deps: TiptapProseAdapterDeps): ProseEditorHandle => {
  const { getEditor, getFallbackContent, getScroller, setLoading, notifyChange } = deps;

  return {
    getContent: () => {
      const editor = getEditor();
      if (!editor) return getFallbackContent();
      return serializeTiptapWithMarkers(editor);
    },
    setContent: (value: string) => {
      const editor = getEditor();
      if (!editor) return;
      // The load guard MUST clear even if setContent / extractTiptapAnchors throws. Without the
      // finally, a single thrown load leaves `isLoadingRef` stuck true, so TipTap's onUpdate
      // returns early on every later keystroke — the change chain dies silently and the buffer is
      // saved/swapped by nothing. This was the data-loss vector (plan: never-lose-writing, Phase 1).
      setLoading(true);
      try {
        editor.commands.setContent(value, { emitUpdate: false });
        extractTiptapAnchors(editor);
      } catch (error) {
        // Swallow rather than rethrow: setContent runs inside React effects (recovery apply,
        // restore-from-server), and a throw escaping there risks unmounting the editor tree. Log
        // loudly so the failure is not silent; the user-facing surface is Phase 3.
        console.error("[ProseEditor] setContent failed", error);
      } finally {
        setLoading(false);
      }
    },
    getSelection: (): SelectionCapture => {
      const editor = getEditor();
      if (!editor) return { text: "", isEmpty: true };
      const { from, to } = editor.state.selection;
      if (from === to) return { text: "", isEmpty: true };
      const slice = editor.state.doc.slice(from, to);
      const storage = editor.storage as unknown as MarkdownStorage;
      const raw = storage.markdown.serializer.serialize(slice.content);
      const text = raw.trim();
      return { text, isEmpty: text.length === 0 };
    },
    focus: () => {
      getEditor()?.commands.focus();
    },
    getCurrentBlock: () => {
      const editor = getEditor();
      if (!editor) return null;
      const { $from } = editor.state.selection;
      const pos = $from.pos;
      let index = 0;
      editor.state.doc.forEach((node, offset, childIndex) => {
        if (pos >= offset && pos <= offset + node.nodeSize) index = childIndex;
      });
      const markerId = markerForBlock(tiptapAnchorBlockIndex(editor.state), index);
      return { text: stripCommentMarkers($from.parent.textContent).trim(), markerId, index };
    },
    addAnchorAtBlock: (blockIndex: number, markerId: string) => {
      const editor = getEditor();
      if (!editor) return;
      let blockEnd: number | null = null;
      editor.state.doc.forEach((node, offset, index) => {
        if (index === blockIndex) blockEnd = offset + 1 + node.content.size;
      });
      if (blockEnd === null) return;
      addTiptapAnchor(editor, blockEnd, markerId);
      notifyChange();
    },
    removeAnchor: (markerId: string) => {
      const editor = getEditor();
      if (!editor) return;
      const current = tiptapAnchorKey.getState(editor.state) ?? [];
      const next = current.filter((anchor) => anchor.markerId !== markerId);
      editor.view.dispatch(editor.state.tr.setMeta(tiptapAnchorKey, next));
      notifyChange();
    },
    revealAnchor: (markerId: string) => {
      const editor = getEditor();
      if (!editor) return;
      const anchor = (tiptapAnchorKey.getState(editor.state) ?? []).find(
        (entry) => entry.markerId === markerId,
      );
      if (anchor) editor.chain().setTextSelection(anchor.pos).scrollIntoView().run();
    },
    focusAnchorBlock: (markerId: string) => {
      const editor = getEditor();
      if (!editor) return;
      const anchor = (tiptapAnchorKey.getState(editor.state) ?? []).find(
        (entry) => entry.markerId === markerId,
      );
      if (anchor) editor.chain().focus().setTextSelection(anchor.pos).scrollIntoView().run();
    },
    getScrollElement: (): HTMLElement | null => getScroller(),
    getBlocks: (): EditorBlock[] => {
      const editor = getEditor();
      return editor ? richEditorBlocks(editor, getScroller()) : [];
    },
    setHighlightedAnchor: () => {
      // vim/raw only (the bug-fix + cue scope). Rich mode is a no-op for now.
    },
    insertAtCursor: (text: string) => {
      const editor = getEditor();
      if (!editor) return;
      // insertContent on a plain string inserts it as text (no HTML/markdown parsing of `[[…]]`),
      // so the link round-trips as literal prose.
      editor.chain().focus().insertContent(text).run();
    },
  };
};
