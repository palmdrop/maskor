import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import CodeMirror, { EditorView, keymap, Prec } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim } from "@replit/codemirror-vim";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { stripCommentMarkers, splitCommentMarkers } from "@maskor/shared";
import { buildSharedProseExtensions, proseClassName } from "./shared-prose-extensions";
import { cmAnchorExtension, setCmAnchorsEffect, cmAnchorBlockIndex } from "./anchor-cm";
import { cmAnchorHighlightExtension } from "./anchor-highlight-cm";
import {
  tiptapAnchorExtension,
  tiptapAnchorKey,
  tiptapAnchorBlockIndex,
  extractTiptapAnchors,
  serializeTiptapWithMarkers,
} from "./anchor-tiptap";
import { blockRanges } from "@lib/margins/block-ranges";
import { richEditorBlocks, markerForBlock, type EditorBlock } from "./editor-geometry";
import { isTrailingWhitespaceEquivalent } from "./buffer-sync";
import { ProseToolbar } from "./prose-toolbar";
import { createCodeMirrorProseAdapter } from "./prose-editor-cm-adapter";

// Re-exported so existing consumers keep importing the block shape from the editor entry point.
export type { EditorBlock };
import { yankGenerator } from "../lib/vim/yank";
import { patchDeleteClipboard } from "../lib/vim/delete";
import type { PersistedCursor } from "@hooks/usePersistedCursor";
import { useHandleCommandEvent } from "../lib/commands/useHandleCommandEvent";

type MarkdownStorage = {
  markdown: {
    getMarkdown: () => string;
    serializer: { serialize: (content: unknown) => string };
  };
};

export type SelectionCapture = { text: string; isEmpty: boolean };

export type ProseEditorHandle = {
  getContent: () => string;
  setContent: (value: string) => void;
  getSelection: () => SelectionCapture;
  focus: () => void;
  // Anchor operations backing the Margin comment gesture and scroll correspondence (ADR 0009). The
  // anchor is held in the per-mode anchor store and mapped through edits — never written into the live
  // buffer — and re-emitted as `<!--c:ID-->` only on save. `markerId` is the comment anchored to the
  // block (the first one), or null; `index` is the block's document-order index for the margin slot.
  // (Method names predate the buffer-clean model; they now operate on anchors, not buffer markers.)
  getCurrentBlock: () => { text: string; markerId: string | null; index: number } | null;
  // Anchor a comment at a specific block (by document-order index) — the column's type-to-create. No
  // buffer mutation; the marker materialises on the next save. No-op when the index is out of range.
  addAnchorAtBlock: (blockIndex: number, markerId: string) => void;
  // Drop a comment's anchor (the delete-comment coordinated edit). No buffer mutation — the marker
  // simply stops being re-emitted. No-op when the anchor is absent (an orphan leaves the fragment be).
  removeAnchor: (markerId: string) => void;
  // Scroll the editor to the block carrying `markerId`.
  revealAnchor: (markerId: string) => void;
  // Move the caret into the block carrying `markerId` and focus the editor (Escape from a comment
  // returns to its bound paragraph).
  focusAnchorBlock: (markerId: string) => void;
  // The scrolling element of the active editor, for scroll-sync with the margin column.
  getScrollElement: () => HTMLElement | null;
  // The authoritative block list (ADR 0009): the editor — not the margin — enumerates the fragment's
  // blocks and measures their geometry, so the margin column renders one row per entry in this order
  // and binds comments by `markerId`. This removes the old two-index-space mismatch between a separate
  // markdown parse and the editor's DOM nodes. `top`/`height` are content-relative pixels (0 when
  // geometry can't yet be measured); `text` is the marker-stripped block opening for type-to-create.
  getBlocks: () => EditorBlock[];
  // Highlight the block a Margin comment is anchored to (the reciprocal connection cue), or null to
  // clear. Presentation only (a line decoration). vim/raw only; rich is a no-op in this iteration.
  setHighlightedAnchor: (markerId: string | null) => void;
};

// Append an anchor at a ProseMirror position (block end). Coordinated-edit semantics: held as an
// anchor, not buffer text; the caller fires onChange so the fragment dirties and the marker
// re-emits on the next save.
const addTiptapAnchor = (editor: Editor, pos: number, markerId: string): void => {
  const current = tiptapAnchorKey.getState(editor.state) ?? [];
  editor.view.dispatch(editor.state.tr.setMeta(tiptapAnchorKey, [...current, { markerId, pos }]));
};

type Props = {
  content: string;
  vimMode: boolean;
  rawMarkdownMode: boolean;
  fontSize: number;
  maxParagraphWidth: number;
  vimClipboardSync: boolean;
  onSave?: () => void;
  onChange?: () => void;
  cursor?: PersistedCursor;
  // The comment markerId of the block the caret is in (or null), reported on selection change so the
  // Margin can highlight that block's comment — the reciprocal half of the connection cue.
  onActiveBlockChange?: (markerId: string | null) => void;
};

export const ProseEditor = forwardRef<ProseEditorHandle, Props>(function ProseEditor(
  {
    content,
    vimMode,
    rawMarkdownMode,
    fontSize,
    maxParagraphWidth,
    vimClipboardSync,
    onSave,
    onChange,
    cursor,
    onActiveBlockChange,
  },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null);
  // Guards the marker-stripping load transaction so it never marks the buffer dirty (it changes the
  // doc — deleting the transient marker nodes — but is a load step, not a user edit).
  const isLoadingRef = useRef(false);
  // The rich-mode scroll container, for scroll-sync with the margin column.
  const richScrollerRef = useRef<HTMLDivElement | null>(null);
  // The on-disk content carries `<!--c:ID-->` markers; the live editor buffer never does (ADR 0009).
  // Strip them here, keeping the marker-free text the editor shows and each marker's offset (the
  // anchor) — seeded into the per-mode anchor store and re-emitted on save.
  const { clean: cleanContent, anchors: loadedAnchors } = useMemo(
    () => splitCommentMarkers(content),
    [content],
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Latest content, read by the adapters' `getFallbackContent` (before their backend mounts).
  const contentRef = useRef(content);
  contentRef.current = content;
  const onActiveBlockChangeRef = useRef(onActiveBlockChange);
  onActiveBlockChangeRef.current = onActiveBlockChange;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const vimClipboardSyncRef = useRef(vimClipboardSync);
  vimClipboardSyncRef.current = vimClipboardSync;
  // Identity of the cursor target the rich editor has already restored, so
  // restore runs once and never fights the user's caret while editing.
  const restoredCursorRef = useRef<PersistedCursor | null>(null);
  // CodeMirror caret is restored at state-creation time via the `selection`
  // prop below — atomic with the doc, so nothing (vim init, @uiw value sync,
  // StrictMode double-mount) can reset it afterward. Read once: the editor
  // subtree is keyed per entity and content is already loaded at mount, so the
  // offset clamps against the real document.
  const [initialSelection] = useState(() => {
    const offset = cursor?.read() ?? 0;
    return { anchor: Math.min(Math.max(offset, 0), cleanContent.length) };
  });

  // The value handed to CodeMirror. @uiw replaces the whole document whenever this prop differs from
  // the live doc (dropping the caret to the doc end and flickering) — so we only let it change on a
  // *genuine* content change. A save round-trip re-normalizes the body (trim + trailing newline) on the
  // server, which would otherwise trip a needless replace; the guard effect below keeps `cmValue` equal
  // to the live doc in that case so @uiw skips it (mirrors the rich path's trailing-whitespace guard).
  const [cmValue, setCmValue] = useState(cleanContent);
  useEffect(() => {
    if (!(vimMode || rawMarkdownMode)) return;
    const view = viewRef.current;
    const current = view ? view.state.doc.toString() : cmValue;
    if (isTrailingWhitespaceEquivalent(cleanContent, current)) {
      // Equivalent modulo trailing whitespace: hand back the live doc string so `value === doc` and
      // @uiw performs no replace, leaving the caret untouched.
      if (cmValue !== current) setCmValue(current);
      return;
    }
    // `cmValue` is intentionally not a dependency: this effect decides whether to adopt `cleanContent`,
    // and re-running it on its own output would loop.
    setCmValue(cleanContent);
  }, [cleanContent, vimMode, rawMarkdownMode]);

  // The `selection` prop places the caret on the initial state; this focuses
  // the fresh view and centers that caret in the viewport (like vim `zz`).
  const focusAndCenterCaret = useCallback(
    (view: EditorView) => {
      view.focus();
      view.dispatch({
        effects: EditorView.scrollIntoView(initialSelection.anchor, { y: "center" }),
      });
    },
    [initialSelection],
  );
  // onSave is closed into Vim.defineEx at editor-create time, which only fires once.
  // Without a ref the :w handler keeps the initial onSave whose closure sees a stale
  // isDirty=false, and the save short-circuits.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const cmTheme = useMemo(
    () =>
      EditorView.theme({
        "&": {
          fontFamily: "var(--font-serif)",
          fontSize: `${fontSize}px`,
          height: "100%",
        },
        ".cm-content": {
          padding: "1rem",
          // Prose reads better than CM6's cramped base-theme 1.4; the Margin is absolutely anchored to
          // measured block tops, so this no longer needs to match the Margin's line-height.
          lineHeight: "1.75",
        },
        ".cm-focused": {
          outline: "none",
        },
        ".cm-scroller": {
          overflow: "auto",
          height: "100%",
          fontFamily: "var(--font-serif)",
        },
      }),
    [fontSize],
  );

  // Persist the caret on every user-driven selection change so a refresh or
  // navigation can restore it. The focus guard skips programmatic/init/teardown
  // selections (e.g. vim's setup) that would otherwise clobber the saved slot.
  // Reads the callback off a ref so the extension stays stable.
  const selectionListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.selectionSet && update.view.hasFocus) {
          cursorRef.current?.save(update.state.selection.main.head);
          // Report the caret's block (by its comment markerId, or null) so the Margin can highlight
          // the matching comment — the reciprocal half of the connection cue.
          if (onActiveBlockChangeRef.current) {
            const head = update.state.selection.main.head;
            const ranges = blockRanges(update.state.doc.toString());
            const index = ranges.findIndex((range) => head >= range.from && head <= range.to);
            const markerId =
              index === -1 ? null : markerForBlock(cmAnchorBlockIndex(update.state), index);
            onActiveBlockChangeRef.current(markerId);
          }
        }
      }),
    [],
  );

  const checkIsBoundCommand = useHandleCommandEvent({});

  const vimExtensions = useMemo(
    () => [
      markdown(),
      // This extension ensures that CodeMirror does not execute in-editor commands at the same time as the command system executes a command
      // TODO: Create a test for this
      Prec.high(
        keymap.of([
          {
            any: (_, event) => {
              // Do not intercept unless a modifier key is pressed
              if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
                return false;

              // Check if the event is bound to a command in the command system
              const commandId = checkIsBoundCommand(event);

              // If yes, tell CodeMirror to ignore the event
              if (commandId) return true;

              // Otherwise, tell CodeMirror to handle the event
              return false;
            },
          },
        ]),
      ),
      vim(),
      cmTheme,
      EditorView.lineWrapping,
      selectionListener,
      cmAnchorExtension,
      cmAnchorHighlightExtension,
    ],
    [cmTheme, selectionListener],
  );
  const rawExtensions = useMemo(
    () => [markdown(), cmTheme, selectionListener, cmAnchorExtension, cmAnchorHighlightExtension],
    [cmTheme, selectionListener],
  );

  // NOTE: TipTap editor is always created, even when in vim/raw mode. Split into two components?
  const editor = useEditor({
    extensions: [...buildSharedProseExtensions(), tiptapAnchorExtension],
    content,
    onUpdate: () => {
      // The marker-stripping load transaction changes the doc but must not dirty the buffer.
      if (isLoadingRef.current) return;
      onChangeRef.current?.();
    },
    onSelectionUpdate: ({ editor: tiptapEditor }) => {
      if (tiptapEditor.isFocused) cursorRef.current?.save(tiptapEditor.state.selection.head);
    },
    editorProps: {
      attributes: {
        class: `${proseClassName} focus:outline-none min-h-[200px] px-1 py-2`,
      },
    },
  });

  // Sync server content into the rich editor, then restore the persisted caret.
  // Restoring here — rather than in a separate effect — guarantees the document
  // already holds the loaded content, so the saved offset lands correctly
  // instead of clamping against an empty doc on refresh.
  useEffect(() => {
    if (!editor) return;

    // The buffer holds clean markdown, so compare against the clean content. A real change reloads:
    // set the marker-bearing content (markdown-it parses each marker into a transient `commentMarker`
    // node), then strip those nodes into mapped anchor positions, leaving a marker-free buffer.
    // Trailing whitespace is normalized by the server on write (body.trim()), so trim both sides
    // before comparing — a trailing-newline difference must not trigger a full setContent that resets
    // the caret.
    const current = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
    const didSyncContent = !isTrailingWhitespaceEquivalent(cleanContent, current);
    if (didSyncContent) {
      isLoadingRef.current = true;
      editor.commands.setContent(content, { emitUpdate: false });
      extractTiptapAnchors(editor);
      isLoadingRef.current = false;
    }

    if (vimMode || rawMarkdownMode) return;
    if (!cursor) return;
    const isNewTarget = restoredCursorRef.current !== cursor;
    if (!isNewTarget && !didSyncContent) return;
    restoredCursorRef.current = cursor;

    // An offset past the doc end is snapped to the nearest valid spot. Focus
    // only when arriving at a new entity/mode, so a content re-sync doesn't
    // steal focus back from elsewhere.
    const chain = editor
      .chain()
      .setTextSelection(cursor.read() ?? 0)
      .scrollIntoView();
    if (isNewTarget) chain.focus();
    chain.run();
  }, [content, cleanContent, editor, cursor, vimMode, rawMarkdownMode]);

  // CM6 anchor seeding: the raw/vim buffer is the clean string (`value={cleanContent}` below), so seed
  // the anchor field from the markers parsed out of the on-disk content whenever it (re)loads. The
  // initial mount seeds via `onCreateEditor`; this covers later content changes / restores.
  useEffect(() => {
    if (!(vimMode || rawMarkdownMode)) return;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setCmAnchorsEffect.of(loadedAnchors) });
  }, [cleanContent, loadedAnchors, vimMode, rawMarkdownMode]);

  // The CodeMirror (vim + raw) backend behind the handle. Stable: it reads the live view, the
  // latest content, and the change notifier through injected accessors.
  const cmAdapter = useMemo(
    () =>
      createCodeMirrorProseAdapter({
        getView: () => viewRef.current,
        getFallbackContent: () => contentRef.current,
        setCmValue,
        notifyChange: () => onChangeRef.current?.(),
      }),
    [],
  );

  useImperativeHandle(ref, (): ProseEditorHandle => {
    if (vimMode || rawMarkdownMode) return cmAdapter;
    // Rich (TipTap) backend — extracted into its own adapter in the next phase.
    return {
      getContent: () => {
        if (!editor) return content;
        return serializeTiptapWithMarkers(editor);
      },
      setContent: (value: string) => {
        if (!editor) return;
        isLoadingRef.current = true;
        editor.commands.setContent(value, { emitUpdate: false });
        extractTiptapAnchors(editor);
        isLoadingRef.current = false;
      },
      getSelection: (): SelectionCapture => {
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
        editor?.commands.focus();
      },
      getCurrentBlock: () => {
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
        if (!editor) return;
        let blockEnd: number | null = null;
        editor.state.doc.forEach((node, offset, index) => {
          if (index === blockIndex) blockEnd = offset + 1 + node.content.size;
        });
        if (blockEnd === null) return;
        addTiptapAnchor(editor, blockEnd, markerId);
        onChangeRef.current?.();
      },
      removeAnchor: (markerId: string) => {
        if (!editor) return;
        const current = tiptapAnchorKey.getState(editor.state) ?? [];
        const next = current.filter((anchor) => anchor.markerId !== markerId);
        editor.view.dispatch(editor.state.tr.setMeta(tiptapAnchorKey, next));
        onChangeRef.current?.();
      },
      revealAnchor: (markerId: string) => {
        if (!editor) return;
        const anchor = (tiptapAnchorKey.getState(editor.state) ?? []).find(
          (entry) => entry.markerId === markerId,
        );
        if (anchor) editor.chain().setTextSelection(anchor.pos).scrollIntoView().run();
      },
      focusAnchorBlock: (markerId: string) => {
        if (!editor) return;
        const anchor = (tiptapAnchorKey.getState(editor.state) ?? []).find(
          (entry) => entry.markerId === markerId,
        );
        if (anchor) editor.chain().focus().setTextSelection(anchor.pos).scrollIntoView().run();
      },
      getScrollElement: (): HTMLElement | null => richScrollerRef.current,
      getBlocks: (): EditorBlock[] =>
        editor ? richEditorBlocks(editor, richScrollerRef.current) : [],
      setHighlightedAnchor: () => {
        // vim/raw only (the bug-fix + cue scope). Rich mode is a no-op for now.
      },
    };
  }, [vimMode, rawMarkdownMode, editor, content, cmAdapter]);

  // fontSize is set on the same element as maxWidth so `ch` resolves against the
  // rendered text size — otherwise `ch` falls back to the browser default (16px)
  // and the container width detaches from the actual line length.
  const widthStyle = { maxWidth: `${maxParagraphWidth}ch`, fontSize: `${fontSize}px` };

  if (vimMode || rawMarkdownMode) {
    return (
      <div className="h-full mx-auto w-full" style={widthStyle}>
        <CodeMirror
          value={cmValue}
          selection={initialSelection}
          extensions={vimMode ? vimExtensions : rawExtensions}
          onCreateEditor={(view) => {
            viewRef.current = view;
            // Seed the anchors parsed out of the on-disk content (the buffer shows `cleanContent`).
            view.dispatch({ effects: setCmAnchorsEffect.of(loadedAnchors) });

            Vim.defineEx("w", "", () => onSaveRef.current?.());
            // Kudos https://github.com/ianhi/jupyterlab-vimrc/blob/2dedaf7f48b7b3bd462defda77ae3865fbff70e9/src/index.ts#L34-L37
            if (vimMode) {
              const registerController = Vim.getRegisterController();
              const getClipboardSync = () => vimClipboardSyncRef.current;
              Vim.defineOperator("yank", yankGenerator(registerController, getClipboardSync));
              patchDeleteClipboard(registerController, getClipboardSync);
            }
            focusAndCenterCaret(view);
          }}
          onChange={() => onChangeRef.current?.()}
          basicSetup={{ lineNumbers: false, foldGutter: false }}
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2 w-full">
      <ProseToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto" ref={richScrollerRef}>
        <div
          className="mx-auto w-full"
          style={{
            fontSize: `${fontSize}px`,
            maxWidth: `${maxParagraphWidth}ch`,
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
});
