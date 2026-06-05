import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { OverviewDetailLevel } from "../../../router";
import { FragmentProse } from "./FragmentProse";

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

interface ProseSpineProps {
  sectionsData: SectionData[];
  detailLevel: OverviewDetailLevel;
  fragmentByUuid: Map<string, FragmentSummary>;
  contentByFragmentUuid: Map<string, string>;
  selectedFragmentUuid: string | null;
  onSelectFragment: (fragmentUuid: string) => void;
}

// The vertical reading spine: placed fragments rendered as flowing prose in
// sequence order, grouped under section headings, collapsible down the
// detail-level axis (prose → excerpt → title). Content comes from the
// per-fragment bulk endpoint, held client-side so reorders reflow optimistically.
export const ProseSpine = ({
  sectionsData,
  detailLevel,
  fragmentByUuid,
  contentByFragmentUuid,
  selectedFragmentUuid,
  onSelectFragment,
}: ProseSpineProps) => {
  const isEmpty = sectionsData.every((section) => section.fragmentUuids.length === 0);

  if (isEmpty) {
    return (
      <p className="text-sm text-muted-foreground">
        No fragments placed yet. Drag fragments from the pool to build this sequence.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="prose-spine">
      {sectionsData.map((section) => (
        <section key={section.uuid} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {section.name || <span className="italic">Untitled section</span>}{" "}
            <span className="tabular-nums">({section.fragmentUuids.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {section.fragmentUuids.map((fragmentUuid) => {
              const fragment = fragmentByUuid.get(fragmentUuid);
              if (!fragment) return null;
              return (
                <FragmentProse
                  key={fragmentUuid}
                  fragmentUuid={fragmentUuid}
                  title={fragment.key}
                  content={contentByFragmentUuid.get(fragmentUuid) ?? ""}
                  excerpt={fragment.excerpt ?? undefined}
                  detailLevel={detailLevel}
                  isSelected={selectedFragmentUuid === fragmentUuid}
                  onSelect={onSelectFragment}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
