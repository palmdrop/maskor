import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";

interface SectionZoneProps {
  children: React.ReactNode;
  sectionId: string;
  isEmpty: boolean;
  fragmentUuids: string[];
  width: number;
}

export const SectionZone = ({ children, sectionId, isEmpty, fragmentUuids, width }: SectionZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });
  return (
    <div
      ref={setNodeRef}
      style={{ width }}
      className={`flex flex-row gap-3 min-h-36 p-4 rounded-lg border-2 border-dashed transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-border/50"
      }`}
    >
      <SortableContext items={fragmentUuids} strategy={horizontalListSortingStrategy}>
        {isEmpty && !isOver && (
          <p className="text-sm text-muted-foreground self-center mx-auto">
            Drag fragments here to build your sequence.
          </p>
        )}
        {children}
      </SortableContext>
    </div>
  );
};
