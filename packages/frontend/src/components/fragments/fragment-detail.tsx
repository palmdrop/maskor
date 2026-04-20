import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { useGetFragment } from "../../api/generated/fragments/fragments";
import { Heading } from "../heading";
import { Separator } from "../ui/separator";
import { FragmentMetadata } from "./fragment-metadata";

type Props = {
  projectId: string;
  fragmentId: string;
};

function ProseViewer({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      Link.configure({ openOnClick: false }),
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

  return <EditorContent editor={editor} />;
}

export function FragmentDetail({ projectId, fragmentId }: Props) {
  const { data: envelope, isLoading, isError } = useGetFragment(projectId, fragmentId);

  if (isLoading) {
    return <p>Loading fragment...</p>;
  }

  if (isError || !envelope) {
    return <p>Failed to load fragment.</p>;
  }

  const fragment = envelope.status === 200 ? envelope.data : null;

  if (!fragment) {
    return <p>Fragment unavailable.</p>;
  }

  return (
    <div>
      <Heading level={1}>{fragment.title}</Heading>
      <Separator />
      <FragmentMetadata fragment={fragment} />
      <Separator />
      <ProseViewer content={fragment.content} />
    </div>
  );
}
