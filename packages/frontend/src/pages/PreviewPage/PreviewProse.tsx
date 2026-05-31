import { ReadonlyProse } from "@components/readonly-prose";

type Props = {
  markdown: string;
  fontSize: number;
  maxParagraphWidth: number;
};

// The assembled markdown is produced server-side with toggles already applied
// and anchor sentinels embedded. Rendering is the shared read-only Tiptap
// renderer — the same one the import preview uses.
export const PreviewProse = ({ markdown, fontSize, maxParagraphWidth }: Props) => {
  return (
    <div className="py-6 px-6">
      <ReadonlyProse content={markdown} fontSize={fontSize} maxParagraphWidth={maxParagraphWidth} />
    </div>
  );
};
