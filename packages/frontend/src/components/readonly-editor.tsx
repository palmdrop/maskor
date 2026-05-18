import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Typography from "@tiptap/extension-typography";

export type ReadonlyEditorProps = {
  content: string;
  fontSize: number;
  maxParagraphWidth: number;
};

export const ReadonlyEditor = ({ content, fontSize, maxParagraphWidth }: ReadonlyEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      Typography,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-stone dark:prose-invert max-w-none px-1 py-2",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content);
  }, [content, editor]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div
        className="mx-auto w-full"
        style={{ fontSize: `${fontSize}px`, maxWidth: `${maxParagraphWidth}ch` }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
