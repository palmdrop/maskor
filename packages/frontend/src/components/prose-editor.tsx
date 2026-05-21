import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim } from "@replit/codemirror-vim";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Typography from "@tiptap/extension-typography";
import { ProseToolbar } from "./prose-toolbar";

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
};

type Props = {
  content: string;
  vimMode: boolean;
  rawMarkdownMode: boolean;
  fontSize: number;
  maxParagraphWidth: number;
  onSave?: () => void;
  onChange?: () => void;
};

export const ProseEditor = forwardRef<ProseEditorHandle, Props>(function ProseEditor(
  { content, vimMode, rawMarkdownMode, fontSize, maxParagraphWidth, onSave, onChange },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      // Link.configure({ openOnClick: false }),
      Typography,
    ],
    content,
    onUpdate: () => onChangeRef.current?.(),
    editorProps: {
      attributes: {
        class:
          "prose prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-1 py-2",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const current = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
    if (content !== current) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

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
    }),
    [vimMode, rawMarkdownMode, editor, content],
  );

  // fontSize is set on the same element as maxWidth so `ch` resolves against the
  // rendered text size — otherwise `ch` falls back to the browser default (16px)
  // and the container width detaches from the actual line length.
  const widthStyle = { maxWidth: `${maxParagraphWidth}ch`, fontSize: `${fontSize}px` };

  if (vimMode) {
    return (
      <div className="h-full mx-auto w-full" style={widthStyle}>
        <CodeMirror
          value={content}
          extensions={[markdown(), vim(), cmTheme, EditorView.lineWrapping]}
          onCreateEditor={(view) => {
            viewRef.current = view;
            Vim.defineEx("w", "", () => onSaveRef.current?.());
          }}
          onChange={() => onChangeRef.current?.()}
          basicSetup={{ lineNumbers: false, foldGutter: false }}
          className="h-full"
        />
      </div>
    );
  }

  // TODO: can this and the case above get merged? only diff is vim plugin and Vim.defineEx
  if (rawMarkdownMode) {
    return (
      <div className="h-full mx-auto w-full" style={widthStyle}>
        <CodeMirror
          value={content}
          extensions={[markdown(), cmTheme]}
          onCreateEditor={(view) => {
            viewRef.current = view;
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
      <div className="flex-1 overflow-y-auto">
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
