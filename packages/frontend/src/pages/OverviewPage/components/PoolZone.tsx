import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { POOL_ZONE_ID } from "../constants";

interface PoolZoneProps {
  children: React.ReactNode;
  isEmpty: boolean;
  poolFragmentUuids: string[];
}

export const PoolZone = ({ children, isEmpty, poolFragmentUuids }: PoolZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-36 p-4 rounded-lg border-2 border-dashed transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-border/50"
      }`}
    >
      <SortableContext items={poolFragmentUuids} strategy={rectSortingStrategy}>
        <div className="flex flex-wrap gap-3">
          {isEmpty && !isOver && (
            <p className="text-sm text-muted-foreground self-center mx-auto">
              All fragments are placed in the sequence.
            </p>
          )}
          {children}
        </div>
      </SortableContext>
    </div>
  );
};
