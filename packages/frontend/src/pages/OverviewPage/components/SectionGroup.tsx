import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, Trash2Icon } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { toSectionDragId } from "../utils/dndIds";
import { ReorderRow } from "./ReorderRow";
import { ListDropZone } from "./ListDropZone";
import { InlineConfirmActions } from "./InlineConfirmActions";
import type { SectionData, SectionRef, SelectModifiers } from "./reorder-types";

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
  isUnsaved: (fragmentUuid: string) => boolean;
  getRelativeLength: (fragmentUuid: string) => number | undefined;
  highlightedFragmentUuids: Set<string>;
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
  // Hide section-management affordances (rename, merge, delete, drag-reorder) —
  // used by the placement-modal arranger, which only arranges the active
  // fragment and does not manage sections.
  showSectionControls?: boolean;
  // Read-only section (an import-sequence in the Overview): no drag, no edits.
  readOnly?: boolean;
}

// A draggable section: its header (drag handle, inline rename, merge/delete
// affordances) plus the droppable list of its fragment rows.
export const SectionGroup = ({
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
  isUnsaved,
  getRelativeLength,
  highlightedFragmentUuids,
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
  showSectionControls = true,
  readOnly = false,
}: SectionGroupProps) => {
  // Section-level editing (rename, merge, delete, drag-reorder) is available only
  // when controls are shown and the sequence is writable.
  const sectionEditable = showSectionControls && !readOnly;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: toSectionDragId(section.uuid),
    disabled: !sectionEditable,
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
      {!sectionEditable ? (
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {section.name || <span className="italic">Untitled section</span>}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            ({section.fragmentUuids.length})
          </span>
        </div>
      ) : confirmingDeleteSectionId === section.uuid ? (
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
          <InlineConfirmActions
            confirmLabel="Delete"
            onConfirm={onDeleteSection}
            onCancel={() => setConfirmingDeleteSectionId(null)}
            className="gap-2"
          />
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
              <GripVerticalIcon size={12} />
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
                <ArrowUpIcon size={12} />
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
                <ArrowDownIcon size={12} />
              </button>
            )}
            {totalSections > 1 && (
              <button
                type="button"
                onClick={() => setConfirmingDeleteSectionId(section.uuid)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Delete section "${section.name || "Untitled section"}"`}
              >
                <Trash2Icon size={12} />
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
              isUnsaved={isUnsaved(fragmentUuid)}
              relativeLength={getRelativeLength(fragmentUuid)}
              isHighlighted={highlightedFragmentUuids.has(fragmentUuid)}
              isSelected={selectedFragmentUuids.has(fragmentUuid)}
              onSelect={onSelectFragment}
              onRemove={onRemoveFragment}
              disabled={readOnly}
            />
          );
        })}
      </ListDropZone>
    </section>
  );
};
