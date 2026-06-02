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
import { useEditor, EditorContent } from "@tiptap/react";
import {
  buildCommentMarker,
  stripCommentMarkers,
  createCommentMarkerTokenRegex,
  extractCommentMarkerIds,
  stripCommentMarker,
} from "@maskor/shared";
import { buildSharedProseExtensions, proseClassName } from "./shared-prose-extensions";
import { commentMarkerExtension } from "./comment-marker-cm";
import { blockSpacerExtension, blockSpacerKey } from "./block-spacer-tiptap";
import { cmBlockSpacerExtension, setCmSpacersEffect } from "./block-spacer-cm";
import { blockRanges } from "@lib/margins/block-ranges";
import { ProseToolbar } from "./prose-toolbar";
import { yankGenerator } from "../lib/vim/yank";
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
  // Marker-block operations backing the Margin comment gesture and scroll correspondence. The block
  // is the line (CM6/vim) or the parent text block (TipTap) at the cursor. `markerId` is the comment
  // anchor already present on that block (the first one), or null — used to enforce one comment per
  // block (the gesture focuses the existing comment instead of injecting a second marker). `index` is
  // the block's document-order index (matching `enumerateBlocks`), for jumping to its margin slot.
  getCurrentBlock: () => { text: string; markerId: string | null; index: number } | null;
  appendCommentMarker: (markerId: string) => void;
  // Inject a marker into a specific block (blank-line paragraph, by document-order index) — the
  // annotated-paragraphs column's type-to-create on an arbitrary paragraph. No-op when the index is
  // out of range.
  insertCommentMarkerInBlock: (blockIndex: number, markerId: string) => void;
  // Strip a comment's anchor marker from the buffer (the delete-comment coordinated edit). No-op when
  // the marker is absent (an orphaned comment leaves the fragment untouched).
  stripCommentMarker: (markerId: string) => void;
  revealCommentMarker: (markerId: string) => void;
  // Move the caret into the block carrying `markerId` and focus the editor (Escape from a comment
  // returns to its bound paragraph).
  focusMarkerBlock: (markerId: string) => void;
  // The scrolling element of the active editor, for scroll-sync with the margin column.
  getScrollElement: () => HTMLElement | null;
  // The authoritative block list (ADR 0009): the editor — not the margin — enumerates the fragment's
  // blocks and measures their geometry, so the margin column renders one row per entry in this order
  // and binds comments by `markerId`. This removes the old two-index-space mismatch between a separate
  // markdown parse and the editor's DOM nodes. `top`/`height` are content-relative pixels (0 when
  // geometry can't yet be measured); `text` is the marker-stripped block opening for type-to-create.
  getBlocks: () => EditorBlock[];
  // Push document-side spacers (pixels, indexed by block) so a tall Margin comment pushes the next
  // block down, keeping rows aligned. A decoration only — never a buffer edit (ADR 0009).
  setBlockSpacers: (spacers: number[]) => void;
};

// One block as the editor reports it: its comment anchor (the first marker on the block, or null),
// the marker-stripped opening text, and its content-relative top/height in pixels.
export type EditorBlock = {
  markerId: string | null;
  text: string;
  top: number;
  height: number;
};

type Props = {
  content: string;
  vimMode: boolean;
  rawMarkdownMode: boolean;
  fontSize: number;
  maxParagraphWidth: number;
  // Reveal the raw `<!--c:ID-->` anchor markers verbatim (the "show source" toggle). Default off.
  showSource?: boolean;
  onSave?: () => void;
  onChange?: () => void;
  cursor?: PersistedCursor;
};

export const ProseEditor = forwardRef<ProseEditorHandle, Props>(function ProseEditor(
  {
    content,
    vimMode,
    rawMarkdownMode,
    fontSize,
    maxParagraphWidth,
    showSource = false,
    onSave,
    onChange,
    cursor,
  },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null);
  // The rich-mode scroll container, for scroll-sync with the margin column.
  const richScrollerRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
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
    return { anchor: Math.min(Math.max(offset, 0), content.length) };
  });

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
      commentMarkerExtension(showSource),
      cmBlockSpacerExtension,
    ],
    [cmTheme, selectionListener, showSource],
  );
  const rawExtensions = useMemo(
    () => [
      markdown(),
      cmTheme,
      selectionListener,
      commentMarkerExtension(showSource),
      cmBlockSpacerExtension,
    ],
    [cmTheme, selectionListener, showSource],
  );

  // NOTE: TipTap editor is always created, even when in vim/raw mode. Split into two components?
  const editor = useEditor({
    extensions: [...buildSharedProseExtensions(), blockSpacerExtension],
    content,
    onUpdate: () => onChangeRef.current?.(),
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

    const current = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
    // setContent collapses the selection to the doc end, so we must re-place the
    // caret whenever it runs — not just on first sight of a target. It only runs
    // on load/navigation (the content prop is stable while typing), so this
    // never fights the user's caret mid-edit.
    const didSyncContent = content !== current;
    if (didSyncContent) {
      editor.commands.setContent(content, { emitUpdate: false });
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
  }, [content, editor, cursor, vimMode, rawMarkdownMode]);

  useImperativeHandle(
    ref,
    () => ({
      getContent: () => {
        if (vimMode || rawMarkdownMode) {
          return viewRef.current?.state.doc.toString() ?? content;
        }
        return (editor?.storage as unknown as MarkdownStorage)?.markdown.getMarkdown() ?? content;
      },
      setContent: (value: string) => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: value },
          });
          return;
        }
        editor?.commands.setContent(value, { emitUpdate: false });
      },
      getSelection: (): SelectionCapture => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return { text: "", isEmpty: true };
          const { from, to } = view.state.selection.main;
          const raw = view.state.doc.sliceString(from, to);
          const text = raw.trim();
          return { text, isEmpty: text.length === 0 };
        }
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
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          view.focus();
        } else {
          editor.commands.focus();
        }
      },
      getCurrentBlock: (): { text: string; markerId: string | null; index: number } | null => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return null;
          const head = view.state.selection.main.head;
          const ranges = blockRanges(view.state.doc.toString());
          const index = ranges.findIndex((range) => head >= range.from && head <= range.to);
          const line = view.state.doc.lineAt(head);
          const markerId = extractCommentMarkerIds(line.text)[0] ?? null;
          return {
            text: stripCommentMarkers(line.text).trim(),
            markerId,
            index: index === -1 ? Math.max(ranges.length - 1, 0) : index,
          };
        }
        if (!editor) return null;
        const { $from } = editor.state.selection;
        // The marker is an atom node with no textContent, so scan the block's children for it.
        let markerId: string | null = null;
        $from.parent.forEach((child) => {
          if (markerId === null && child.type.name === "commentMarker") {
            markerId = (child.attrs.markerId as string | null) ?? null;
          }
        });
        // The top-level block index containing the caret.
        const pos = $from.pos;
        let index = 0;
        editor.state.doc.forEach((node, offset, childIndex) => {
          if (pos >= offset && pos <= offset + node.nodeSize) index = childIndex;
        });
        return { text: stripCommentMarkers($from.parent.textContent).trim(), markerId, index };
      },
      appendCommentMarker: (markerId: string) => {
        const marker = buildCommentMarker(markerId);
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          // Trailing the block's line; the marker decoration hides it in place.
          const line = view.state.doc.lineAt(view.state.selection.main.head);
          view.dispatch({ changes: { from: line.to, insert: marker } });
          return;
        }
        if (!editor) return;
        // Insert the schema-modeled marker node at the end of the current text block.
        const end = editor.state.selection.$from.end();
        editor.commands.insertContentAt(end, { type: "commentMarker", attrs: { markerId } });
      },
      insertCommentMarkerInBlock: (blockIndex: number, markerId: string) => {
        const marker = buildCommentMarker(markerId);
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          const range = blockRanges(view.state.doc.toString())[blockIndex];
          if (!range) return;
          view.dispatch({ changes: { from: range.to, insert: marker } });
          return;
        }
        if (!editor) return;
        // Find the blockIndex-th top-level node and insert the marker node at its end.
        let targetEnd: number | null = null;
        editor.state.doc.forEach((node, offset, index) => {
          if (index === blockIndex) {
            // +1 enters the node; +node.content.size lands at the end of its inline content.
            targetEnd = offset + 1 + node.content.size;
          }
        });
        if (targetEnd === null) return;
        editor.commands.insertContentAt(targetEnd, {
          type: "commentMarker",
          attrs: { markerId },
        });
      },
      stripCommentMarker: (markerId: string) => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          const text = view.state.doc.toString();
          const next = stripCommentMarker(text, markerId);
          if (next === text) return;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
          return;
        }
        if (!editor) return;
        let from: number | null = null;
        let to: number | null = null;
        editor.state.doc.descendants((node, position) => {
          if (from !== null) return false;
          if (node.type.name === "commentMarker" && node.attrs.markerId === markerId) {
            from = position;
            to = position + node.nodeSize;
            return false;
          }
          return true;
        });
        if (from !== null && to !== null) {
          editor.chain().deleteRange({ from, to }).run();
        }
      },
      revealCommentMarker: (markerId: string) => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          const text = view.state.doc.toString();
          const regex = createCommentMarkerTokenRegex();
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            if (match[1] === markerId) {
              view.dispatch({ effects: EditorView.scrollIntoView(match.index, { y: "center" }) });
              return;
            }
          }
          return;
        }
        if (!editor) return;
        let markerPosition: number | null = null;
        editor.state.doc.descendants((node, position) => {
          if (markerPosition !== null) return false;
          if (node.type.name === "commentMarker" && node.attrs.markerId === markerId) {
            markerPosition = position;
            return false;
          }
          return true;
        });
        if (markerPosition !== null) {
          editor.chain().setTextSelection(markerPosition).scrollIntoView().run();
        }
      },
      focusMarkerBlock: (markerId: string) => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          const text = view.state.doc.toString();
          const regex = createCommentMarkerTokenRegex();
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            if (match[1] === markerId) {
              view.focus();
              view.dispatch({
                selection: { anchor: match.index },
                effects: EditorView.scrollIntoView(match.index, { y: "center" }),
              });
              return;
            }
          }
          return;
        }
        if (!editor) return;
        let markerPosition: number | null = null;
        editor.state.doc.descendants((node, position) => {
          if (markerPosition !== null) return false;
          if (node.type.name === "commentMarker" && node.attrs.markerId === markerId) {
            markerPosition = position;
            return false;
          }
          return true;
        });
        if (markerPosition !== null) {
          editor.chain().focus().setTextSelection(markerPosition).scrollIntoView().run();
        }
      },
      getScrollElement: (): HTMLElement | null => {
        if (vimMode || rawMarkdownMode) return viewRef.current?.scrollDOM ?? null;
        return richScrollerRef.current;
      },
      getBlocks: (): EditorBlock[] => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return [];
          const scroller = view.scrollDOM;
          // Content-relative origin: subtract the scroller's viewport top and add its scroll offset
          // so `top` is independent of the current scroll position.
          const contentOrigin = scroller.getBoundingClientRect().top - scroller.scrollTop;
          return blockRanges(view.state.doc.toString()).map((range) => {
            const raw = view.state.doc.sliceString(range.from, range.to);
            const markerId = extractCommentMarkerIds(raw)[0] ?? null;
            const text = stripCommentMarkers(raw).trim();
            const top = view.coordsAtPos(range.from);
            const bottom = view.coordsAtPos(range.to);
            if (!top || !bottom) return { markerId, text, top: 0, height: 0 };
            return {
              markerId,
              text,
              top: top.top - contentOrigin,
              height: Math.max(0, bottom.bottom - top.top),
            };
          });
        }
        if (!editor) return [];
        const scroller = richScrollerRef.current;
        const contentOrigin = scroller
          ? scroller.getBoundingClientRect().top - scroller.scrollTop
          : 0;
        const blocks: EditorBlock[] = [];
        editor.state.doc.forEach((node, offset) => {
          // The marker is an atom node with no textContent; scan the block's children for it.
          let markerId: string | null = null;
          node.forEach((child) => {
            if (markerId === null && child.type.name === "commentMarker") {
              markerId = (child.attrs.markerId as string | null) ?? null;
            }
          });
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
      },
      setBlockSpacers: (spacers: number[]) => {
        if (vimMode || rawMarkdownMode) {
          const view = viewRef.current;
          if (!view) return;
          // Effect-only dispatch: no doc change, so the buffer is never dirtied.
          view.dispatch({ effects: setCmSpacersEffect.of(spacers) });
          return;
        }
        if (!editor) return;
        // Meta-only transaction: `docChanged` is false, so TipTap's onUpdate never fires.
        editor.view.dispatch(editor.state.tr.setMeta(blockSpacerKey, spacers));
      },
    }),
    [vimMode, rawMarkdownMode, editor, content],
  );

  // fontSize is set on the same element as maxWidth so `ch` resolves against the
  // rendered text size — otherwise `ch` falls back to the browser default (16px)
  // and the container width detaches from the actual line length.
  const widthStyle = { maxWidth: `${maxParagraphWidth}ch`, fontSize: `${fontSize}px` };

  if (vimMode || rawMarkdownMode) {
    return (
      <div className="h-full mx-auto w-full" style={widthStyle}>
        <CodeMirror
          value={content}
          selection={initialSelection}
          extensions={vimMode ? vimExtensions : rawExtensions}
          onCreateEditor={(view) => {
            viewRef.current = view;

            Vim.defineEx("w", "", () => onSaveRef.current?.());
            // Kudos https://github.com/ianhi/jupyterlab-vimrc/blob/2dedaf7f48b7b3bd462defda77ae3865fbff70e9/src/index.ts#L34-L37
            if (vimMode) {
              Vim.defineOperator("yank", yankGenerator(Vim.getRegisterController(), true));
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
          style={{ fontSize: `${fontSize}px`, maxWidth: `${maxParagraphWidth}ch` }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
});
