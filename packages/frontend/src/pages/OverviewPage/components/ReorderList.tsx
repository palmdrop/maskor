import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { POOL_ZONE_ID, toSectionDragId } from "../utils/dndIds";
import { Heading } from "@components/heading";
import { ReorderRow } from "./ReorderRow";
import { ListDropZone } from "./ListDropZone";
import { SectionGroup } from "./SectionGroup";
import type { SectionData, SectionRef, SelectModifiers } from "./reorder-types";

interface ReorderListProps {
  sectionsData: SectionData[];
  poolFragmentUuids: string[];
  colorByAspectKey: Map<string, string>;
  fragmentByUuid: Map<string, FragmentSummary>;
  selectedFragmentUuids: Set<string>;
  onSelectFragment: (fragmentUuid: string, modifiers?: SelectModifiers) => void;
  onRemoveFragment: (fragmentUuid: string) => void;
  getViolationTooltips: (fragmentUuid: string) => string[];
  getCycleTooltips: (fragmentUuid: string) => string[];
  editingSectionId: string | null;
  setEditingSectionId: (id: string | null) => void;
  editingSectionValue: string;
  setEditingSectionValue: (value: string) => void;
  confirmingDeleteSectionId: string | null;
  setConfirmingDeleteSectionId: (id: string | null) => void;
  handleSectionRenameCommit: (sectionId: string, newName: string) => void;
  handleSectionRenameKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    sectionId: string,
    originalName: string,
  ) => void;
  onDeleteSection: () => void;
  onMergeUp: (section: SectionRef) => void;
  onMergeDown: (section: SectionRef) => void;
  hasSequence: boolean;
  createSectionPending: boolean;
  onAddSection: () => void;
}

// Left working column: a compact vertical title list of placed fragments grouped
// by section, with the unassigned pool as a distinct region beneath. Selecting a
// row sets the selected fragment; dragging reorders within/between sections and
// places/unplaces against the pool (shared `useSequenceDnD` logic).
export const ReorderList = ({
  sectionsData,
  poolFragmentUuids,
  colorByAspectKey,
  fragmentByUuid,
  selectedFragmentUuids,
  onSelectFragment,
  onRemoveFragment,
  getViolationTooltips,
  getCycleTooltips,
  editingSectionId,
  setEditingSectionId,
  editingSectionValue,
  setEditingSectionValue,
  confirmingDeleteSectionId,
  setConfirmingDeleteSectionId,
  handleSectionRenameCommit,
  handleSectionRenameKeyDown,
  onDeleteSection,
  onMergeUp,
  onMergeDown,
  hasSequence,
  createSectionPending,
  onAddSection,
}: ReorderListProps) => (
  <div className="flex flex-col gap-3" data-testid="reorder-list">
    <SortableContext
      items={sectionsData.map((section) => toSectionDragId(section.uuid))}
      strategy={verticalListSortingStrategy}
    >
      <div className="flex flex-col gap-3">
        {sectionsData.map((section, sectionIndex) => (
          <SectionGroup
            key={section.uuid}
            section={section}
            sectionIndex={sectionIndex}
            totalSections={sectionsData.length}
            colorByAspectKey={colorByAspectKey}
            fragmentByUuid={fragmentByUuid}
            selectedFragmentUuids={selectedFragmentUuids}
            onSelectFragment={onSelectFragment}
            onRemoveFragment={onRemoveFragment}
            getViolationTooltips={getViolationTooltips}
            getCycleTooltips={getCycleTooltips}
            editingSectionId={editingSectionId}
            setEditingSectionId={setEditingSectionId}
            editingSectionValue={editingSectionValue}
            setEditingSectionValue={setEditingSectionValue}
            confirmingDeleteSectionId={confirmingDeleteSectionId}
            setConfirmingDeleteSectionId={setConfirmingDeleteSectionId}
            handleSectionRenameCommit={handleSectionRenameCommit}
            handleSectionRenameKeyDown={handleSectionRenameKeyDown}
            onDeleteSection={onDeleteSection}
            onMergeUp={onMergeUp}
            onMergeDown={onMergeDown}
          />
        ))}
      </div>
    </SortableContext>

    {hasSequence && (
      <button
        type="button"
        onClick={onAddSection}
        disabled={createSectionPending}
        className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50 self-start"
      >
        + Add section
      </button>
    )}

    <div className="flex flex-col gap-1">
      <Heading level={4}>
        Pool <span className="tabular-nums">({poolFragmentUuids.length})</span>
      </Heading>
      <ListDropZone
        zoneId={POOL_ZONE_ID}
        fragmentUuids={poolFragmentUuids}
        isEmpty={poolFragmentUuids.length === 0}
        emptyLabel="All fragments are placed."
      >
        {poolFragmentUuids.map((fragmentUuid) => {
          const fragment = fragmentByUuid.get(fragmentUuid);
          if (!fragment) return null;
          return (
            <ReorderRow
              key={fragmentUuid}
              fragment={fragment}
              colorByAspectKey={colorByAspectKey}
              violationTooltips={[]}
              cycleTooltips={getCycleTooltips(fragmentUuid)}
              isSelected={selectedFragmentUuids.has(fragmentUuid)}
              onSelect={onSelectFragment}
            />
          );
        })}
      </ListDropZone>
    </div>
  </div>
);
