import { useState, useMemo, useCallback } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import {
  useGetMainSequence,
  useGetSequence,
  useListSequences,
  usePlaceFragment,
  useMoveFragment,
  useUnplaceFragment,
  getGetMainSequenceQueryKey,
  getGetSequenceQueryKey,
  type GetMainSequenceResponse,
  type GetSequenceResponse,
} from "@api/generated/sequences/sequences";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { Heading } from "@components/heading";
import { optimisticMove, optimisticPlace, optimisticUnplace } from "./utils/sequences";
import { TileContent } from "./components/TileContent";
import { SortableTile } from "./components/SortableTile";
import { SequenceSidebar } from "./components/SequenceSidebar";

const POOL_ZONE_ID = "pool-zone";
const SEQUENCE_ZONE_ID = "sequence-zone";

function withUpdatedSequence(
  envelope: GetMainSequenceResponse,
  sequence: Sequence,
): GetMainSequenceResponse {
  return { ...envelope, data: sequence } as GetMainSequenceResponse;
}

// TODO: keep breaking out into separate files
const SequenceZone = ({
  children,
  isEmpty,
  sequenceFragmentUuids,
}: {
  children: React.ReactNode;
  isEmpty: boolean;
  sequenceFragmentUuids: string[];
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: SEQUENCE_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-row gap-3 min-h-36 p-4 rounded-lg border-2 border-dashed overflow-x-auto transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-border/50"
      }`}
    >
      <SortableContext items={sequenceFragmentUuids} strategy={horizontalListSortingStrategy}>
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

const PoolZone = ({
  children,
  isEmpty,
  poolFragmentUuids,
}: {
  children: React.ReactNode;
  isEmpty: boolean;
  poolFragmentUuids: string[];
}) => {
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

export const OverviewPage = () => {
  const from = "/projects/$projectId/overview" as const;
  const { projectId } = useParams({ from });
  const { sequence: sequenceParam } = useSearch({ from });
  const queryClient = useQueryClient();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const { data: bundleEnvelope } = useListSequences(projectId);
  const bundle = bundleEnvelope?.status === 200 ? bundleEnvelope.data : undefined;

  const sequenceParamIsKnown = useMemo(
    () => bundle?.sequences.some((s) => s.uuid === sequenceParam) ?? false,
    [bundle, sequenceParam],
  );
  const activeSequenceId = sequenceParamIsKnown ? sequenceParam! : undefined;

  const { data: mainEnvelope, isLoading: mainLoading } = useGetMainSequence(projectId);
  const { data: specificEnvelope, isLoading: specificLoading } = useGetSequence(
    projectId,
    activeSequenceId ?? "",
    { query: { enabled: !!activeSequenceId } },
  );

  const sequenceLoading = activeSequenceId ? specificLoading : mainLoading;
  const sequenceEnvelope: GetMainSequenceResponse | GetSequenceResponse | undefined =
    activeSequenceId ? specificEnvelope : mainEnvelope;

  const { data: summariesEnvelope, isLoading: summariesLoading } =
    useListFragmentSummaries(projectId);

  const sequence = sequenceEnvelope?.status === 200 ? sequenceEnvelope.data : undefined;
  const allFragments = summariesEnvelope?.status === 200 ? summariesEnvelope.data : [];

  const sequenceFragmentUuids = useMemo(() => {
    if (!sequence?.sections[0]) return [];
    return [...sequence.sections[0].fragments]
      .sort((a, b) => a.position - b.position)
      .map((fragment) => fragment.fragmentUuid);
  }, [sequence]);

  const poolFragmentUuids = useMemo(() => {
    const placedSet = new Set(sequenceFragmentUuids);
    return allFragments
      .filter((fragment) => !fragment.isDiscarded && !placedSet.has(fragment.uuid))
      .map((fragment) => fragment.uuid);
  }, [allFragments, sequenceFragmentUuids]);

  const fragmentByUuid = useMemo(
    () => new Map(allFragments.map((fragment) => [fragment.uuid, fragment])),
    [allFragments],
  );

  const activeQueryKey = activeSequenceId
    ? getGetSequenceQueryKey(projectId, activeSequenceId)
    : getGetMainSequenceQueryKey(projectId);

  const placeFragment = usePlaceFragment({
    mutation: {
      onMutate: async ({ data: { fragmentUuid, position } }) => {
        const snapshot = queryClient.getQueryData<GetMainSequenceResponse>(activeQueryKey);
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(
            previous,
            optimisticPlace(previous.data, fragmentUuid, position),
          );
        });
        await queryClient.cancelQueries({ queryKey: activeQueryKey });
        return { snapshot };
      },
      onSuccess: (data) => {
        if (data.status !== 200) return;
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(previous, data.data);
        });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(activeQueryKey, context.snapshot);
      },
    },
  });

  const moveFragment = useMoveFragment({
    mutation: {
      onMutate: async ({ fragmentUuid, data: { position } }) => {
        const snapshot = queryClient.getQueryData<GetMainSequenceResponse>(activeQueryKey);
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(
            previous,
            optimisticMove(previous.data, fragmentUuid, position),
          );
        });
        await queryClient.cancelQueries({ queryKey: activeQueryKey });
        return { snapshot };
      },
      onSuccess: (data) => {
        if (data.status !== 200) return;
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(previous, data.data);
        });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(activeQueryKey, context.snapshot);
      },
    },
  });

  const unplaceFragment = useUnplaceFragment({
    mutation: {
      onMutate: async ({ fragmentUuid }) => {
        const snapshot = queryClient.getQueryData<GetMainSequenceResponse>(activeQueryKey);
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(previous, optimisticUnplace(previous.data, fragmentUuid));
        });
        await queryClient.cancelQueries({ queryKey: activeQueryKey });
        return { snapshot };
      },
      onSuccess: (data) => {
        if (data.status !== 200) return;
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(previous, data.data);
        });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(activeQueryKey, context.snapshot);
      },
    },
  });

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over || !sequence) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sectionUuid = sequence.sections[0]?.uuid ?? "";

    const isActiveInSequence = sequenceFragmentUuids.includes(activeId);
    const isOverInSequence = sequenceFragmentUuids.includes(overId) || overId === SEQUENCE_ZONE_ID;
    const isOverInPool = poolFragmentUuids.includes(overId) || overId === POOL_ZONE_ID;

    if (!isActiveInSequence && isOverInSequence) {
      const position =
        overId === SEQUENCE_ZONE_ID
          ? sequenceFragmentUuids.length
          : sequenceFragmentUuids.indexOf(overId);
      placeFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        data: { fragmentUuid: activeId, sectionUuid, position },
      });
    } else if (isActiveInSequence && isOverInSequence && activeId !== overId) {
      const oldIndex = sequenceFragmentUuids.indexOf(activeId);
      const newIndex =
        overId === SEQUENCE_ZONE_ID
          ? sequenceFragmentUuids.length - 1
          : sequenceFragmentUuids.indexOf(overId);
      if (oldIndex !== newIndex) {
        const reordered = arrayMove(sequenceFragmentUuids, oldIndex, newIndex);
        const position = reordered.indexOf(activeId);
        moveFragment.mutate({
          projectId,
          sequenceId: sequence.uuid,
          fragmentUuid: activeId,
          data: { sectionUuid, position },
        });
      }
    } else if (isActiveInSequence && (isOverInPool || (!isOverInSequence && !isOverInPool))) {
      unplaceFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid: activeId,
      });
    }
  };

  const activeDragFragment = activeDragId ? fragmentByUuid.get(activeDragId) : undefined;

  return (
    <div className="flex h-full overflow-hidden">
      {bundle && (
        <SequenceSidebar
          sequences={bundle.sequences}
          violations={bundle.violations}
          cycles={bundle.cycles}
          activeSequenceId={activeSequenceId}
        />
      )}

      <div className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto">
        {sequenceLoading || summariesLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Heading level={1}>{sequence?.name ?? "Overview"}</Heading>

            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Sequence <span className="tabular-nums">({sequenceFragmentUuids.length})</span>
                </h2>
                <SequenceZone
                  isEmpty={sequenceFragmentUuids.length === 0}
                  sequenceFragmentUuids={sequenceFragmentUuids}
                >
                  {sequenceFragmentUuids.map((uuid) => {
                    const fragment = fragmentByUuid.get(uuid);
                    if (!fragment) return null;
                    return <SortableTile key={uuid} fragment={fragment} inSequence={true} />;
                  })}
                </SequenceZone>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Pool <span className="tabular-nums">({poolFragmentUuids.length})</span>
                </h2>
                <PoolZone
                  isEmpty={poolFragmentUuids.length === 0}
                  poolFragmentUuids={poolFragmentUuids}
                >
                  {poolFragmentUuids.map((uuid) => {
                    const fragment = fragmentByUuid.get(uuid);
                    if (!fragment) return null;
                    return <SortableTile key={uuid} fragment={fragment} inSequence={false} />;
                  })}
                </PoolZone>
              </section>

              <DragOverlay dropAnimation={null}>
                {activeDragFragment ? (
                  <TileContent
                    fragment={activeDragFragment}
                    inSequence={sequenceFragmentUuids.includes(activeDragFragment.uuid)}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
};
