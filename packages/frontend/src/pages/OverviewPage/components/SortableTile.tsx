import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { TileContent } from "./TileContent";

interface TileContentProps {
  fragment: FragmentSummary;
  inSequence: boolean;
  violationTooltips?: string[];
}

export const SortableTile = ({ fragment, inSequence, violationTooltips }: TileContentProps) => {
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
      {...attributes}
      {...listeners}
    >
      <TileContent fragment={fragment} inSequence={inSequence} violationTooltips={violationTooltips} />
    </div>
  );
};
