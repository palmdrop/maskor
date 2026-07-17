import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { POOL_ZONE_ID, toSectionDragId } from "../utils/dndIds";
import { Heading } from "@components/heading";
import { ReorderRow } from "./ReorderRow";
import { ListDropZone } from "./ListDropZone";
import { SectionGroup } from "./SectionGroup";
import type { SectionData, SectionRef, SelectModifiers } from "./reorder-types";

// Stable empty default so surfaces that don't pass a highlight set (the
// placement arranger) don't create a new Set each render.
const EMPTY_HIGHLIGHT_SET: Set<string> = new Set();

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
  // Whether a fragment has unsaved edits (a swap file). Optional — surfaces a
  // leading "dirty" dot on its row; defaults to no-op for surfaces that don't
  // track it (e.g. the placement-modal arranger).
  isUnsaved?: (fragmentUuid: string) => boolean;
  // Content length relative to the longest fragment (0, 1] — drawn as the
  // spine's title-mode length bar on each row. Optional; the placement-modal
  // arranger passes it, the Overview's left column does not.
  getRelativeLength?: (fragmentUuid: string) => number | undefined;
  // Fragments belonging to the sidebar-hovered sequence — placed rows in this
  // set draw a highlight ring. Pool rows are never highlighted (they are not
  // placed in the active sequence). Optional; only the Overview passes it.
  highlightedFragmentUuids?: Set<string>;
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
  // Hide section-management affordances (rename/merge/delete/reorder + add-section).
  // The placement-modal arranger sets this false; the Overview leaves it true.
  showSectionControls?: boolean;
  // Read-only sequence (an import-sequence): no drag, no edits, no pool.
  readOnly?: boolean;
  // "stacked" (default) puts the pool beneath the sections — the Overview's
  // single narrow column. "split" places the pool in a column beside the
  // sections, each independently scrollable — the placement modal, where the
  // pool can be long and dragging it up past the sections is awkward.
  layout?: "stacked" | "split";
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
  isUnsaved = () => false,
  getRelativeLength = () => undefined,
  highlightedFragmentUuids = EMPTY_HIGHLIGHT_SET,
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
  showSectionControls = true,
  readOnly = false,
  layout = "stacked",
}: ReorderListProps) => {
  const sectionsBlock = (
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
            isUnsaved={isUnsaved}
            getRelativeLength={getRelativeLength}
            highlightedFragmentUuids={highlightedFragmentUuids}
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
            showSectionControls={showSectionControls}
            readOnly={readOnly}
          />
        ))}
      </div>
    </SortableContext>
  );

  const addSectionButton = hasSequence && showSectionControls && !readOnly && (
    <button
      type="button"
      onClick={onAddSection}
      disabled={createSectionPending}
      className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50 self-start"
    >
      + Add section
    </button>
  );

  const poolBlock = !readOnly && (
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
              isUnsaved={isUnsaved(fragmentUuid)}
              relativeLength={getRelativeLength(fragmentUuid)}
              isSelected={selectedFragmentUuids.has(fragmentUuid)}
              onSelect={onSelectFragment}
            />
          );
        })}
      </ListDropZone>
    </div>
  );

  if (layout === "split") {
    return (
      <div className="flex gap-4" data-testid="reorder-list">
        <div className="flex flex-1 min-w-0 flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
          {sectionsBlock}
          {addSectionButton}
        </div>
        {poolBlock && (
          <div className="w-56 shrink-0 max-h-[50vh] overflow-y-auto pr-1">{poolBlock}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="reorder-list">
      {sectionsBlock}
      {addSectionButton}
      {poolBlock}
    </div>
  );
};
