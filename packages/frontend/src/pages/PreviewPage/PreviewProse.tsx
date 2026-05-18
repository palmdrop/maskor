import type { AssembledSequence } from "@api/generated/maskorAPI.schemas";
import type { ProjectPreviewSeparator } from "@api/generated/maskorAPI.schemas";
import { ReadonlyEditor } from "@components/readonly-editor";

type Props = {
  assembled: AssembledSequence;
  showTitles: boolean;
  showSectionHeadings: boolean;
  separator: ProjectPreviewSeparator;
  fontSize: number;
  maxParagraphWidth: number;
};

const FragmentSeparator = ({ separator }: { separator: ProjectPreviewSeparator }) => {
  if (separator === "horizontal-rule") return <hr className="my-4 border-border" />;
  if (separator === "blank-line") return <div className="h-6" />;
  return null;
};

export const PreviewProse = ({
  assembled,
  showTitles,
  showSectionHeadings,
  separator,
  fontSize,
  maxParagraphWidth,
}: Props) => {
  return (
    <div
      className="mx-auto w-full py-6 px-6"
      style={{ fontSize: `${fontSize}px`, maxWidth: `${maxParagraphWidth}ch` }}
    >
      {assembled.sections.map((section, sectionIndex) => (
        <div key={section.uuid}>
          {sectionIndex > 0 && <div className="h-10" />}
          {showSectionHeadings && section.name && (
            <h2 className="text-xl font-semibold mb-4">{section.name}</h2>
          )}
          {section.fragments.map((fragment, fragmentIndex) => (
            <div key={fragment.uuid}>
              {fragmentIndex > 0 && <FragmentSeparator separator={separator} />}
              <div id={`fragment-${fragment.uuid}`}>
                {showTitles && fragment.key && (
                  <h3 className="text-base font-medium mb-2">{fragment.key}</h3>
                )}
                <ReadonlyEditor
                  content={fragment.content}
                  fontSize={fontSize}
                  maxParagraphWidth={maxParagraphWidth}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
