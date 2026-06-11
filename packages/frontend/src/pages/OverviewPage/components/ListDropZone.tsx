import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

interface ListDropZoneProps {
  zoneId: string;
  fragmentUuids: string[];
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}

// A droppable, sortable region for reorder rows (a section body or the pool).
export const ListDropZone = ({
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
