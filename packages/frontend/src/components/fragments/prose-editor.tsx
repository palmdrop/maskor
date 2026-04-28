import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vim, Vim } from "@replit/codemirror-vim";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Typography from "@tiptap/extension-typography";
import { ProseToolbar } from "./prose-toolbar";

type MarkdownStorage = {
  markdown: { getMarkdown: () => string };
};

export type ProseEditorHandle = {
  getContent: () => string;
};

type Props = {
  content: string;
  // TODO: wire to a real settings/config system
  vimMode: boolean;
  onSave?: () => void;
  onChange?: () => void;
};

const vimEditorTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9rem",
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
  },
});

export const ProseEditor = forwardRef<ProseEditorHandle, Props>(function ProseEditor(
  { content, vimMode, onSave, onChange },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  useImperativeHandle(
    ref,
    () => ({
      getContent: () => {
        if (vimMode) {
          return viewRef.current?.state.doc.toString() ?? content;
        }
        return (editor?.storage as unknown as MarkdownStorage)?.markdown.getMarkdown() ?? content;
      },
    }),
    [vimMode, editor, content],
  );

  if (vimMode) {
    return (
      <CodeMirror
        value={content}
        extensions={[markdown(), vim(), vimEditorTheme]}
        onCreateEditor={(view) => {
          viewRef.current = view;
          Vim.defineEx("w", "", () => onSave?.());
        }}
        onChange={() => onChangeRef.current?.()}
        basicSetup={{ lineNumbers: false, foldGutter: false }}
        className="h-full"
        maxWidth="100%"
      />
    );
  }

  return (
    <div className="flex flex-col h-full gap-2 w-full">
      <ProseToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
