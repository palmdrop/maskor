import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import type { OverviewDensity } from "../../../router";
import { TileContent } from "./TileContent";

interface SortableTileProps {
  fragment: FragmentSummary;
  density: OverviewDensity;
  colorByAspectKey: Map<string, string>;
  violationTooltips?: string[];
  cycleTooltips?: string[];
  isSelected?: boolean;
  onSelect?: (uuid: string) => void;
}

export const SortableTile = ({
  fragment,
  density,
  colorByAspectKey,
  violationTooltips,
  cycleTooltips,
  isSelected,
  onSelect,
}: SortableTileProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fragment.uuid,
  });
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(fragment.uuid);
      }}
      {...attributes}
      {...listeners}
    >
      <TileContent
        fragment={fragment}
        density={density}
        colorByAspectKey={colorByAspectKey}
        violationTooltips={violationTooltips}
        cycleTooltips={cycleTooltips}
        isSelected={isSelected}
      />
    </div>
  );
};
