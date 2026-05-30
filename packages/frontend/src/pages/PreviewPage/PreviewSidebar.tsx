import type { PreviewNavSection } from "@api/generated/maskorAPI.schemas";

type Props = {
  sections: PreviewNavSection[];
};

export const PreviewSidebar = ({ sections }: Props) => {
  const scrollToFragment = (uuid: string) => {
    document
      .getElementById(`fragment-${uuid}`)
      ?.scrollIntoView({ behavior: "instant", block: "start" });
  };

  const totalFragments = sections.reduce((sum, section) => sum + section.fragments.length, 0);

  return (
    <aside className="flex flex-col w-60 shrink-0 border-r border-border overflow-y-auto">
      <div className="px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {totalFragments} fragment{totalFragments !== 1 ? "s" : ""}
      </div>
      {sections.map((section) => (
        <div key={section.uuid}>
          {section.name && (
            <div className="px-4 py-1 text-xs font-semibold text-muted-foreground truncate">
              {section.name}
            </div>
          )}
          <ul className="flex flex-col gap-0.5 px-2 pb-2">
            {section.fragments.map((fragment) => (
              <li key={fragment.uuid}>
                <button
                  type="button"
                  className="text-left w-full text-sm px-2 py-1 rounded hover:bg-muted truncate"
                  onClick={() => scrollToFragment(fragment.uuid)}
                >
                  {fragment.key}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
};
