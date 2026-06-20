import { useRef } from "react";
import { Trash2Icon } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { SelectModifiers } from "./reorder-types";

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

interface ReorderRowProps {
  fragment: FragmentSummary;
  // Retained for the (currently hidden) AspectColorBar; threaded through unchanged.
  colorByAspectKey: Map<string, string>;
  violationTooltips: string[];
  cycleTooltips: string[];
  isSelected: boolean;
  onSelect: (fragmentUuid: string, modifiers?: SelectModifiers) => void;
  // When set, a hover trash affordance removes this fragment from the sequence.
  // Only passed for placed rows (pool rows are already unplaced).
  onRemove?: (fragmentUuid: string) => void;
  // Read-only row (e.g. an import-sequence in the Overview): no drag, no remove.
  disabled?: boolean;
  // The fragment has an unsaved-content swap file — shows a leading "dirty" dot
  // (matching the fragment list). Leading position + tooltip distinguish it from
  // the trailing violation/cycle dots.
  isUnsaved?: boolean;
}

// A single placed/pool fragment row: a compact, draggable, selectable title line.
export const ReorderRow = ({
  fragment,
  /* colorByAspectKey,*/
  violationTooltips,
  cycleTooltips,
  isSelected,
  onSelect,
  onRemove,
  disabled = false,
  isUnsaved = false,
}: ReorderRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fragment.uuid,
    disabled,
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
      {...(disabled ? {} : listeners)}
      className={`group flex items-center gap-2 rounded border px-2 py-1 text-xs select-none transition-colors ${
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${
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
      {isUnsaved && (
        <span
          className="inline-block w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500"
          title="Unsaved changes"
          aria-label="Unsaved changes"
        />
      )}
      <span className="truncate flex-1">{fragment.key}</span>
      <RowIndicators violationTooltips={violationTooltips} cycleTooltips={cycleTooltips} />
      {onRemove && !disabled && (
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
