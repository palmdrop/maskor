import { useRef } from "react";
import { Trash2Icon } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
// import { AspectColorBar } from "./AspectColorBar";
import { POOL_ZONE_ID, toSectionDragId } from "../utils/dndIds";
import { Heading } from "@components/heading";

interface SectionData {
  uuid: string;
  name: string;
  fragmentUuids: string[];
}

interface RowIndicatorsProps {
  violationTooltips: string[];
  cycleTooltips: string[];
}

const RowIndicators = ({ violationTooltips, cycleTooltips }: RowIndicatorsProps) => (
  <span className="flex items-center gap-1 shrink-0">
    {violationTooltips.length > 0 && (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
        title={violationTooltips.join("\n")}
        aria-label={`Ordering violation: ${violationTooltips.join("; ")}`}
      />
    )}
    {cycleTooltips.length > 0 && (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"
        title={cycleTooltips.join("\n")}
        aria-label={`Cycle: ${cycleTooltips.join("; ")}`}
      />
    )}
  </span>
);

type SelectModifiers = { toggle?: boolean; range?: boolean };

interface ReorderRowProps {
  fragment: FragmentSummary;
  colorByAspectKey: Map<string, string>;
  violationTooltips: string[];
  cycleTooltips: string[];
  isSelected: boolean;
  onSelect: (fragmentUuid: string, modifiers?: SelectModifiers) => void;
  // When set, a hover trash affordance removes this fragment from the sequence.
  // Only passed for placed rows (pool rows are already unplaced).
  onRemove?: (fragmentUuid: string) => void;
}

const ReorderRow = ({
  fragment,
  /* colorByAspectKey,*/
  violationTooltips,
  cycleTooltips,
  isSelected,
  onSelect,
  onRemove,
}: ReorderRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fragment.uuid,
  });

  // Focus fires before click. A pointer-driven focus would single-select the
  // row and clobber the modifier (cmd/shift) handled on the subsequent click —
  // so only the keyboard-driven focus (Tab, no preceding pointerdown) selects.
  const pointerFocusRef = useRef(false);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      data-fragment-uuid={fragment.uuid}
      onPointerDownCapture={() => {
        pointerFocusRef.current = true;
      }}
      onFocus={() => {
        if (pointerFocusRef.current) return;
        onSelect(fragment.uuid);
      }}
      onClick={(event) => {
        event.stopPropagation();
        pointerFocusRef.current = false;
        onSelect(fragment.uuid, {
          toggle: event.metaKey || event.ctrlKey,
          range: event.shiftKey,
        });
      }}
      onBlur={() => {
        pointerFocusRef.current = false;
      }}
      {...attributes}
      {...listeners}
      className={`group flex items-center gap-2 rounded border px-2 py-1 text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
        isSelected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted"
      } ${fragment.isDiscarded ? "bg-muted" : ""}`}
    >
      {/*
      // HIDDEN FOR NOW SINCE IT COVERS THE FRAGMENT TITLE 
      <AspectColorBar
        aspects={fragment.aspects}
        colorByAspectKey={colorByAspectKey}
        className="h-3 w-1 rounded-sm shrink-0"
      />
      */}
      <span className="truncate flex-1">{fragment.key}</span>
      <RowIndicators violationTooltips={violationTooltips} cycleTooltips={cycleTooltips} />
      {onRemove && (
        <button
          type="button"
          // Stop the pointer event before it reaches the sortable listeners,
          // otherwise pressing the trash starts a drag instead of a click.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(fragment.uuid);
          }}
          aria-label={`Remove "${fragment.key}" from sequence`}
          title="Remove from sequence"
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2Icon size={12} />
        </button>
      )}
    </div>
  );
};

interface ListDropZoneProps {
  zoneId: string;
  fragmentUuids: string[];
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}

const ListDropZone = ({
  zoneId,
  fragmentUuids,
  isEmpty,
  emptyLabel,
  children,
}: ListDropZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-1 min-h-16 rounded-md border border-dashed p-2 pb-4 transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-border/50"
      }`}
    >
      <SortableContext items={fragmentUuids} strategy={verticalListSortingStrategy}>
        {isEmpty && !isOver && (
          <p className="text-xs text-muted-foreground px-1 py-1">{emptyLabel}</p>
        )}
        {children}
      </SortableContext>
    </div>
  );
};

type SectionRef = { uuid: string; name: string };

interface SectionGroupProps {
  section: SectionData;
  sectionIndex: number;
  totalSections: number;
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
}

const SectionGroup = ({
  section,
  sectionIndex,
  totalSections,
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
}: SectionGroupProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toSectionDragId(section.uuid),
  });

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex flex-col gap-1"
    >
      {confirmingDeleteSectionId === section.uuid ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Delete section?{" "}
            {section.fragmentUuids.length > 0 && (
              <span>
                {section.fragmentUuids.length} fragment
                {section.fragmentUuids.length !== 1 ? "s" : ""} return to the pool.
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
          {totalSections > 1 && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Drag to reorder section "${section.name || "Untitled section"}"`}
              className="p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
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
          {editingSectionId === section.uuid ? (
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={editingSectionValue}
              onChange={(event) => setEditingSectionValue(event.target.value)}
              onKeyDown={(event) => handleSectionRenameKeyDown(event, section.uuid, section.name)}
              onBlur={() => handleSectionRenameCommit(section.uuid, editingSectionValue)}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide bg-transparent border-b border-border focus:outline-none flex-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingSectionId(section.uuid);
                setEditingSectionValue(section.name);
              }}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground text-left"
            >
              {section.name || <span className="italic">Untitled section</span>}
            </button>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            ({section.fragmentUuids.length})
          </span>
          <div className="ml-auto flex items-center">
            {sectionIndex > 0 && (
              <button
                type="button"
                onClick={() => onMergeUp({ uuid: section.uuid, name: section.name })}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Merge section "${section.name || "Untitled section"}" into the previous section`}
                title="Merge into previous section"
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
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
            {sectionIndex < totalSections - 1 && (
              <button
                type="button"
                onClick={() => onMergeDown({ uuid: section.uuid, name: section.name })}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Merge section "${section.name || "Untitled section"}" into the next section`}
                title="Merge into next section"
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
                  <path d="M12 5v14" />
                  <path d="M5 12l7 7 7-7" />
                </svg>
              </button>
            )}
            {totalSections > 1 && (
              <button
                type="button"
                onClick={() => setConfirmingDeleteSectionId(section.uuid)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Delete section "${section.name || "Untitled section"}"`}
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
        </div>
      )}
      <ListDropZone
        zoneId={section.uuid}
        fragmentUuids={section.fragmentUuids}
        isEmpty={section.fragmentUuids.length === 0}
        emptyLabel="Drag fragments here."
      >
        {section.fragmentUuids.map((fragmentUuid) => {
          const fragment = fragmentByUuid.get(fragmentUuid);
          if (!fragment) return null;
          return (
            <ReorderRow
              key={fragmentUuid}
              fragment={fragment}
              colorByAspectKey={colorByAspectKey}
              violationTooltips={getViolationTooltips(fragmentUuid)}
              cycleTooltips={getCycleTooltips(fragmentUuid)}
              isSelected={selectedFragmentUuids.has(fragmentUuid)}
              onSelect={onSelectFragment}
              onRemove={onRemoveFragment}
            />
          );
        })}
      </ListDropZone>
    </section>
  );
};

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
