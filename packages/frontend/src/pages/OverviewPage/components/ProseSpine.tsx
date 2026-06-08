import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { OverviewDetailLevel } from "../../../router";
import { FragmentProse } from "./FragmentProse";

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

type SortableHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

const DragHandle = ({ attributes, listeners, label }: SortableHandleProps & { label: string }) => (
  <button
    type="button"
    {...attributes}
    {...listeners}
    aria-label={label}
    className="mt-2 shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-colors"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  </button>
);

interface SortableSpineFragmentProps {
  projectId: string;
  fragment: FragmentSummary;
  content: string;
  detailLevel: OverviewDetailLevel;
  isSelected: boolean;
  onSelect: (fragmentUuid: string) => void;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
}

const SortableSpineFragment = ({
  projectId,
  fragment,
  content,
  detailLevel,
  isSelected,
  onSelect,
  onSaveContent,
}: SortableSpineFragmentProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fragment.uuid,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-start gap-1"
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        label={`Drag to reorder "${fragment.key}"`}
      />
      <div className="flex-1 min-w-0">
        <FragmentProse
          projectId={projectId}
          fragmentUuid={fragment.uuid}
          title={fragment.key}
          content={content}
          excerpt={fragment.excerpt ?? undefined}
          detailLevel={detailLevel}
          isSelected={isSelected}
          onSelect={onSelect}
          onSaveContent={onSaveContent}
        />
      </div>
    </div>
  );
};

interface SpineSectionProps {
  projectId: string;
  section: SectionData;
  detailLevel: OverviewDetailLevel;
  fragmentByUuid: Map<string, FragmentSummary>;
  contentByFragmentUuid: Map<string, string>;
  selectedFragmentUuids: Set<string>;
  onSelectFragment: (fragmentUuid: string) => void;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
}

const SpineSection = ({
  projectId,
  section,
  detailLevel,
  fragmentByUuid,
  contentByFragmentUuid,
  selectedFragmentUuids,
  onSelectFragment,
  onSaveContent,
}: SpineSectionProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: section.uuid });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {section.name || <span className="italic">Untitled section</span>}{" "}
        <span className="tabular-nums">({section.fragmentUuids.length})</span>
      </h2>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-3 rounded-md border border-dashed p-3 min-h-28 transition-colors ${
          isOver ? "border-primary/50 bg-primary/5" : "border-border/40"
        }`}
      >
        <SortableContext items={section.fragmentUuids} strategy={verticalListSortingStrategy}>
          {section.fragmentUuids.length === 0 && !isOver && (
            <p className="text-sm text-muted-foreground self-center my-auto">
              Drag fragments here.
            </p>
          )}
          {section.fragmentUuids.map((fragmentUuid) => {
            const fragment = fragmentByUuid.get(fragmentUuid);
            if (!fragment) return null;
            return (
              <SortableSpineFragment
                key={fragmentUuid}
                projectId={projectId}
                fragment={fragment}
                content={contentByFragmentUuid.get(fragmentUuid) ?? ""}
                detailLevel={detailLevel}
                isSelected={selectedFragmentUuids.has(fragmentUuid)}
                onSelect={onSelectFragment}
                onSaveContent={onSaveContent}
              />
            );
          })}
        </SortableContext>
      </div>
    </section>
  );
};

interface ProseSpineProps {
  projectId: string;
  sectionsData: SectionData[];
  detailLevel: OverviewDetailLevel;
  fragmentByUuid: Map<string, FragmentSummary>;
  contentByFragmentUuid: Map<string, string>;
  selectedFragmentUuids: Set<string>;
  onSelectFragment: (fragmentUuid: string) => void;
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
}

// The vertical reading spine: placed fragments rendered as flowing prose in
// sequence order, grouped under section headings, collapsible down the
// detail-level axis (prose → excerpt → title). Fragments are draggable here too
// — each carries a drag handle and its section is a drop target, so reordering
// works at every detail level (shares `useSequenceDnD` via the spine's
// DndContext). Content comes from the per-fragment bulk endpoint, held
// client-side so reorders reflow optimistically.
export const ProseSpine = ({
  projectId,
  sectionsData,
  detailLevel,
  fragmentByUuid,
  contentByFragmentUuid,
  selectedFragmentUuids,
  onSelectFragment,
  onSaveContent,
}: ProseSpineProps) => {
  // Only bail out entirely when the sequence has no sections at all. Empty
  // sections still render as droppable zones so the first fragment can be
  // dropped straight into the spine.
  if (sectionsData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fragments placed yet. Drag fragments from the pool to build this sequence.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="prose-spine">
      {sectionsData.map((section) => (
        <SpineSection
          key={section.uuid}
          projectId={projectId}
          section={section}
          detailLevel={detailLevel}
          fragmentByUuid={fragmentByUuid}
          contentByFragmentUuid={contentByFragmentUuid}
          selectedFragmentUuids={selectedFragmentUuids}
          onSelectFragment={onSelectFragment}
          onSaveContent={onSaveContent}
        />
      ))}
    </div>
  );
};
