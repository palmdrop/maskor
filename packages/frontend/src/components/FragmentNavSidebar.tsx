import type { ReactNode } from "react";
import type { PreviewNavFragment, PreviewNavSection } from "@api/generated/maskorAPI.schemas";

type Props = {
  sections: PreviewNavSection[];
  // Page-specific count/copy line rendered above the list.
  header: ReactNode;
  // Defaults to the fragment key; import overrides with `<index>. <key>`.
  getFragmentLabel?: (fragment: PreviewNavFragment) => string;
  // The currently anchored fragment uuid (from the URL hash), for highlighting.
  activeAnchorId?: string | null;
  onSelect: (anchorId: string) => void;
  className?: string;
};

// Shared navigation sidebar for the preview and import-preview pages. Both feed
// the same `{ sections }` nav payload and scroll to `fragment-<uuid>` anchors,
// so the list/section/active-row rendering lives here once; pages supply only
// the count copy, label, and width.
export const FragmentNavSidebar = ({
  sections,
  header,
  getFragmentLabel = (fragment) => fragment.key,
  activeAnchorId,
  onSelect,
  className = "w-60",
}: Props) => {
  return (
    <aside className={`flex flex-col shrink-0 border-r border-border overflow-y-auto ${className}`}>
      {header}
      {sections.map((section, sectionIndex) => (
        <div key={section.uuid || `section-${sectionIndex}`}>
          {section.name && (
            <div className="px-4 py-1 text-xs font-semibold text-muted-foreground truncate">
              {section.name}
            </div>
          )}
          <ul className="flex flex-col gap-0.5 px-2 pb-2">
            {section.fragments.map((fragment) => {
              const isActive = fragment.uuid === activeAnchorId;
              return (
                <li key={fragment.uuid}>
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    className={`text-left w-full text-sm px-2 py-1 rounded truncate ${
                      isActive ? "bg-muted font-medium" : "hover:bg-muted"
                    }`}
                    onClick={() => onSelect(fragment.uuid)}
                  >
                    {getFragmentLabel(fragment)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
};
