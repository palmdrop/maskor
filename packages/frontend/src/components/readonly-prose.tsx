import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildSharedProseExtensions, proseClassName } from "./shared-prose-extensions";
import { FragmentAnchor } from "./fragment-anchor-extension";

export type ReadonlyProseProps = {
  content: string;
  fontSize: number;
  maxParagraphWidth: number;
};

// The shared read-only renderer for preview and import. One Tiptap instance,
// `editable: false`, no toolbar / vim / raw / cursor / command machinery. Shares
// the extension config + prose class with the editable `ProseEditor` and adds the
// invisible anchor node so sidebar navigation can scroll to `fragment-<id>`.
//
// The whole assembled document renders in a single ProseMirror instance (no
// per-fragment editors). ProseMirror does not virtualize; novel-scale rendering
// is validated separately and a static-HTML fallback is tracked in
// `references/suggestions.md`.
export const ReadonlyProse = ({ content, fontSize, maxParagraphWidth }: ReadonlyProseProps) => {
  const editor = useEditor({
    extensions: [...buildSharedProseExtensions(), FragmentAnchor],
    content,
    editable: false,
    editorProps: {
      attributes: { class: `${proseClassName} px-1 py-2` },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content);
  }, [content, editor]);

  return (
    <div
      className="mx-auto w-full"
      style={{ fontSize: `${fontSize}px`, maxWidth: `${maxParagraphWidth}ch` }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};
