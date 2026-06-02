import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildSharedProseExtensions, proseClassName } from "../shared-prose-extensions";

type MarkdownStorage = {
  markdown: { getMarkdown: () => string };
};

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
};

// The Margin's notes section: free whole-fragment prose, edited rich-text and stored as markdown.
// Reuses the shared prose extensions so notes round-trip markdown identically to fragment bodies.
// Lighter than the main `ProseEditor` (no toolbar/vim/cursor persistence) — notes are a small,
// always-rich surface beside the fragment.
export const MarginNotesEditor = ({ value, onChange, placeholder }: Props) => {
  const editor = useEditor({
    extensions: buildSharedProseExtensions(),
    content: value,
    onUpdate: ({ editor: instance }) => {
      const markdown = (instance.storage as unknown as MarkdownStorage).markdown.getMarkdown();
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: `${proseClassName} focus:outline-none min-h-[100px] text-sm`,
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  // Sync external value into the editor when it diverges and the user isn't typing — e.g. a server
  // re-sync while clean, or a swap recovery applied upstream.
  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  return <EditorContent editor={editor} />;
};
