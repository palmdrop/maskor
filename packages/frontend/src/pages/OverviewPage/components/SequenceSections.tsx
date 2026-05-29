import { forwardRef } from "react";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { OverviewDensity } from "../../../router";
import type { computeSequenceLayout } from "../utils/layout";
import { SectionZone } from "./SectionZone";
import { SortableTile } from "./SortableTile";

export const SECTION_ID_PREFIX = "section:";
export const toSectionDragId = (uuid: string) => `${SECTION_ID_PREFIX}${uuid}`;
export const fromSectionDragId = (id: string) => id.slice(SECTION_ID_PREFIX.length);
export const isSectionDragId = (id: string) => id.startsWith(SECTION_ID_PREFIX);

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

interface SequenceSectionsProps {
  sectionsData: SectionData[];
  sequenceLayout: ReturnType<typeof computeSequenceLayout>;
  density: OverviewDensity;
  colorByAspectKey: Map<string, string>;
  fragmentByUuid: Map<string, FragmentSummary>;
  selectedFragmentUuid: string | null;
  onSelectFragment: (uuid: string | null) => void;
  getViolationTooltips: (uuid: string) => string[];
  getCycleTooltips: (uuid: string) => string[];
  editingSectionId: string | null;
  setEditingSectionId: (id: string | null) => void;
  editingSectionValue: string;
  setEditingSectionValue: (value: string) => void;
  confirmingDeleteSectionId: string | null;
  setConfirmingDeleteSectionId: (id: string | null) => void;
  handleSectionRenameCommit: (sectionId: string, newName: string) => void;
  handleSectionRenameKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    sectionId: string,
    originalName: string,
  ) => void;
  onDeleteSection: () => void;
  hasSequence: boolean;
  createSectionPending: boolean;
  onAddSection: () => void;
  onScroll: () => void;
}

interface SortableSectionProps {
  sectionData: SectionData;
  sectionIndex: number;
  sequenceLayout: ReturnType<typeof computeSequenceLayout>;
  density: OverviewDensity;
  colorByAspectKey: Map<string, string>;
  fragmentByUuid: Map<string, FragmentSummary>;
  selectedFragmentUuid: string | null;
  onSelectFragment: (uuid: string | null) => void;
  getViolationTooltips: (uuid: string) => string[];
  getCycleTooltips: (uuid: string) => string[];
  editingSectionId: string | null;
  setEditingSectionId: (id: string | null) => void;
  editingSectionValue: string;
  setEditingSectionValue: (value: string) => void;
  confirmingDeleteSectionId: string | null;
  setConfirmingDeleteSectionId: (id: string | null) => void;
  handleSectionRenameCommit: (sectionId: string, newName: string) => void;
  handleSectionRenameKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    sectionId: string,
    originalName: string,
  ) => void;
  onDeleteSection: () => void;
  totalSections: number;
}

const SortableSection = ({
  sectionData,
  sectionIndex,
  sequenceLayout,
  density,
  colorByAspectKey,
  fragmentByUuid,
  selectedFragmentUuid,
  onSelectFragment,
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
  totalSections,
}: SortableSectionProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toSectionDragId(sectionData.uuid),
  });

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.4 : 1,
        width: sequenceLayout.sections[sectionIndex]?.width,
      }}
      className="flex flex-col gap-2 shrink-0"
    >
      {confirmingDeleteSectionId === sectionData.uuid ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Delete section?{" "}
            {sectionData.fragmentUuids.length > 0 && (
              <span>
                {sectionData.fragmentUuids.length} fragment
                {sectionData.fragmentUuids.length !== 1 ? "s" : ""} will return to the pool.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDeleteSection}
              className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDeleteSectionId(null)}
              className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="group flex items-center gap-1">
          {/* Drag handle — only show when there are multiple sections */}
          {totalSections > 1 && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Drag to reorder section "${sectionData.name || "Untitled section"}"`}
              className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
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
          )}
          {editingSectionId === sectionData.uuid ? (
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={editingSectionValue}
              onChange={(e) => setEditingSectionValue(e.target.value)}
              onKeyDown={(e) =>
                handleSectionRenameKeyDown(e, sectionData.uuid, sectionData.name)
              }
              onBlur={() => handleSectionRenameCommit(sectionData.uuid, editingSectionValue)}
              className="text-sm font-medium text-muted-foreground uppercase tracking-wide bg-transparent border-b border-border focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingSectionId(sectionData.uuid);
                setEditingSectionValue(sectionData.name);
              }}
              className="text-sm font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground text-left"
            >
              {sectionData.name || <span className="italic">Untitled section</span>}
            </button>
          )}
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            ({sectionData.fragmentUuids.length})
          </span>
          {totalSections > 1 && (
            <button
              type="button"
              onClick={() => setConfirmingDeleteSectionId(sectionData.uuid)}
              className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label={`Delete section "${sectionData.name || "Untitled section"}"`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
        </div>
      )}
      <SectionZone
        sectionId={sectionData.uuid}
        isEmpty={sectionData.fragmentUuids.length === 0}
        fragmentUuids={sectionData.fragmentUuids}
        width={sequenceLayout.sections[sectionIndex]?.width ?? 0}
      >
        {sectionData.fragmentUuids.map((uuid) => {
          const fragment = fragmentByUuid.get(uuid);
          if (!fragment) return null;
          return (
            <SortableTile
              key={uuid}
              fragment={fragment}
              density={density}
              colorByAspectKey={colorByAspectKey}
              violationTooltips={getViolationTooltips(uuid)}
              cycleTooltips={getCycleTooltips(uuid)}
              isSelected={selectedFragmentUuid === uuid}
              onSelect={onSelectFragment}
            />
          );
        })}
      </SectionZone>
    </section>
  );
};

export const SequenceSections = forwardRef<HTMLDivElement, SequenceSectionsProps>(
  (
    {
      sectionsData,
      sequenceLayout,
      density,
      colorByAspectKey,
      fragmentByUuid,
      selectedFragmentUuid,
      onSelectFragment,
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
      hasSequence,
      createSectionPending,
      onAddSection,
      onScroll,
    },
    ref,
  ) => (
    <>
      <div ref={ref} className="overflow-x-auto shrink-0" onScroll={onScroll}>
        <div
          className="flex flex-col gap-2"
          style={{ width: sequenceLayout.totalWidth || undefined, minWidth: "100%" }}
        >
          <SortableContext
            items={sectionsData.map((s) => toSectionDragId(s.uuid))}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-row gap-3 items-start">
              {sectionsData.map((sectionData, sectionIndex) => (
                <SortableSection
                  key={sectionData.uuid}
                  sectionData={sectionData}
                  sectionIndex={sectionIndex}
                  sequenceLayout={sequenceLayout}
                  density={density}
                  colorByAspectKey={colorByAspectKey}
                  fragmentByUuid={fragmentByUuid}
                  selectedFragmentUuid={selectedFragmentUuid}
                  onSelectFragment={onSelectFragment}
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
                  totalSections={sectionsData.length}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      </div>

      {hasSequence && (
        <button
          type="button"
          onClick={onAddSection}
          disabled={createSectionPending}
          className="text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50 self-start"
        >
          + Add section
        </button>
      )}
    </>
  ),
);

SequenceSections.displayName = "SequenceSections";
