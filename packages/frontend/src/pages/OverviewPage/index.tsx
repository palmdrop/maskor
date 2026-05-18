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
} from "@dnd-kit/sortable";

import {
  useGetMainSequence,
  useGetSequence,
  useListSequences,
  usePlaceFragment,
  useMoveFragment,
  useUnplaceFragment,
  useDesignateSequenceMain,
  useCreateSection,
  useRenameSection,
  getGetMainSequenceQueryKey,
  getGetSequenceQueryKey,
  getListSequencesQueryKey,
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

function withUpdatedSequence(
  envelope: GetMainSequenceResponse,
  sequence: Sequence,
): GetMainSequenceResponse {
  return { ...envelope, data: sequence } as GetMainSequenceResponse;
}

const SectionZone = ({
  children,
  sectionId,
  isEmpty,
  fragmentUuids,
}: {
  children: React.ReactNode;
  sectionId: string;
  isEmpty: boolean;
  fragmentUuids: string[];
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-row gap-3 min-h-36 p-4 rounded-lg border-2 border-dashed overflow-x-auto transition-colors ${
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
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState<string>("");

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

  const sectionsData = useMemo(() => {
    if (!sequence) return [];
    return sequence.sections.map((section) => ({
      uuid: section.uuid,
      name: section.name,
      fragmentUuids: [...section.fragments]
        .sort((a, b) => a.position - b.position)
        .map((f) => f.fragmentUuid),
    }));
  }, [sequence]);

  const allSequenceFragmentUuids = useMemo(
    () => sectionsData.flatMap((s) => s.fragmentUuids),
    [sectionsData],
  );

  const fragmentSectionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sectionsData) {
      for (const uuid of section.fragmentUuids) {
        map.set(uuid, section.uuid);
      }
    }
    return map;
  }, [sectionsData]);

  const poolFragmentUuids = useMemo(() => {
    const placedSet = new Set(allSequenceFragmentUuids);
    return allFragments
      .filter((fragment) => !fragment.isDiscarded && !placedSet.has(fragment.uuid))
      .map((fragment) => fragment.uuid);
  }, [allFragments, allSequenceFragmentUuids]);

  const fragmentByUuid = useMemo(
    () => new Map(allFragments.map((fragment) => [fragment.uuid, fragment])),
    [allFragments],
  );

  const activeQueryKey = activeSequenceId
    ? getGetSequenceQueryKey(projectId, activeSequenceId)
    : getGetMainSequenceQueryKey(projectId);

  const placeFragment = usePlaceFragment({
    mutation: {
      onMutate: async ({ data: { fragmentUuid, sectionUuid, position } }) => {
        const snapshot = queryClient.getQueryData<GetMainSequenceResponse>(activeQueryKey);
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(
            previous,
            optimisticPlace(previous.data, fragmentUuid, sectionUuid, position),
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
      onMutate: async ({ fragmentUuid, data: { sectionUuid, position } }) => {
        const snapshot = queryClient.getQueryData<GetMainSequenceResponse>(activeQueryKey);
        queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          return withUpdatedSequence(
            previous,
            optimisticMove(previous.data, fragmentUuid, sectionUuid, position),
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

  const listQueryKey = getListSequencesQueryKey(projectId);

  const designateMain = useDesignateSequenceMain({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
        void queryClient.invalidateQueries({ queryKey: getGetMainSequenceQueryKey(projectId) });
      },
    },
  });

  const refreshActiveSequence = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: activeQueryKey });
    void queryClient.invalidateQueries({ queryKey: listQueryKey });
  }, [queryClient, activeQueryKey, listQueryKey]);

  const createSection = useCreateSection({
    mutation: {
      onSuccess: (data) => {
        if (data.status !== 200) return;
        const updatedSeq = data.data.sequences.find(
          (s) => s.uuid === (activeSequenceId ?? sequence?.uuid),
        );
        const newSection = updatedSeq?.sections[updatedSeq.sections.length - 1];
        if (newSection) {
          setEditingSectionId(newSection.uuid);
          setEditingSectionValue("");
        }
        refreshActiveSequence();
      },
    },
  });

  const renameSection = useRenameSection({
    mutation: {
      onSuccess: () => {
        refreshActiveSequence();
      },
    },
  });

  const handleSectionRenameCommit = (sectionId: string, newName: string) => {
    if (!sequence) return;
    renameSection.mutate({
      projectId,
      sequenceId: sequence.uuid,
      sectionId,
      data: { name: newName },
    });
    setEditingSectionId(null);
  };

  const handleSectionRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    sectionId: string,
    originalName: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSectionRenameCommit(sectionId, editingSectionValue);
    } else if (e.key === "Escape") {
      setEditingSectionId(null);
      setEditingSectionValue(originalName);
    }
  };

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

    const isActiveInSequence = fragmentSectionMap.has(activeId);
    const sectionIds = new Set(sectionsData.map((s) => s.uuid));
    const isOverInSequence = sectionIds.has(overId) || fragmentSectionMap.has(overId);
    const isOverInPool = poolFragmentUuids.includes(overId) || overId === POOL_ZONE_ID;

    const targetSectionUuid =
      sectionIds.has(overId)
        ? overId
        : (fragmentSectionMap.get(overId) ?? sectionsData[0]?.uuid ?? "");

    if (!isActiveInSequence && isOverInSequence) {
      const targetSection = sectionsData.find((s) => s.uuid === targetSectionUuid);
      const position = sectionIds.has(overId)
        ? (targetSection?.fragmentUuids.length ?? 0)
        : (targetSection?.fragmentUuids.indexOf(overId) ?? 0);
      placeFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        data: { fragmentUuid: activeId, sectionUuid: targetSectionUuid, position },
      });
    } else if (isActiveInSequence && isOverInSequence && activeId !== overId) {
      const targetSection = sectionsData.find((s) => s.uuid === targetSectionUuid);
      if (!targetSection) return;

      if (sectionIds.has(overId)) {
        const position = targetSection.fragmentUuids.length;
        moveFragment.mutate({
          projectId,
          sequenceId: sequence.uuid,
          fragmentUuid: activeId,
          data: { sectionUuid: targetSectionUuid, position },
        });
      } else {
        const targetFragmentUuids = targetSection.fragmentUuids;
        const targetIndex = targetFragmentUuids.indexOf(overId);
        if (targetIndex !== -1) {
          moveFragment.mutate({
            projectId,
            sequenceId: sequence.uuid,
            fragmentUuid: activeId,
            data: { sectionUuid: targetSectionUuid, position: targetIndex },
          });
        }
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
            <div className="flex items-center gap-3">
              <Heading level={1}>{sequence?.name ?? "Overview"}</Heading>
              {sequence && !sequence.isMain && (
                <button
                  type="button"
                  onClick={() => designateMain.mutate({ projectId, sequenceId: sequence.uuid })}
                  disabled={designateMain.isPending}
                  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Make main
                </button>
              )}
              {sequence?.isMain && (
                <span className="text-xs px-2 py-1 rounded border border-border text-muted-foreground">
                  Main
                </span>
              )}
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {sectionsData.map((sectionData) => (
                <section key={sectionData.uuid} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {editingSectionId === sectionData.uuid ? (
                      <input
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
                  </div>
                  <SectionZone
                    sectionId={sectionData.uuid}
                    isEmpty={sectionData.fragmentUuids.length === 0}
                    fragmentUuids={sectionData.fragmentUuids}
                  >
                    {sectionData.fragmentUuids.map((uuid) => {
                      const fragment = fragmentByUuid.get(uuid);
                      if (!fragment) return null;
                      return <SortableTile key={uuid} fragment={fragment} inSequence={true} />;
                    })}
                  </SectionZone>
                </section>
              ))}

              {sequence && (
                <button
                  type="button"
                  onClick={() =>
                    createSection.mutate({
                      projectId,
                      sequenceId: sequence.uuid,
                      data: { name: "" },
                    })
                  }
                  disabled={createSection.isPending}
                  className="text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-left transition-colors disabled:opacity-50 self-start"
                >
                  + Add section
                </button>
              )}

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
                    inSequence={fragmentSectionMap.has(activeDragFragment.uuid)}
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
