import { useState, useMemo, useCallback, useRef } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import type { OverviewDensity } from "../../router";
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
  useListSequences,
  usePlaceFragment,
  useMoveFragment,
  useUnplaceFragment,
  useDesignateSequenceMain,
  useCreateSection,
  useRenameSection,
  useDeleteSection,
  getListSequencesQueryKey,
  type ListSequencesResponse,
} from "@api/generated/sequences/sequences";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import type { Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { Heading } from "@components/heading";
import { optimisticMove, optimisticPlace, optimisticUnplace } from "./utils/sequences";
import { TileContent } from "./components/TileContent";
import { SortableTile } from "./components/SortableTile";
import { SequenceSidebar } from "./components/SequenceSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { ArcPanel } from "./components/ArcPanel";
import { ArcLegend } from "./components/ArcLegend";
import { resolveAspectColor } from "./utils/aspectColors";
import { computeSequenceLayout } from "./utils/layout";
import { buildArcSeries, type ArcSeries } from "./utils/arcData";
import { ARC_PANEL_HEIGHT } from "./components/ArcPanel";

const POOL_ZONE_ID = "pool-zone";

const SectionZone = ({
  children,
  sectionId,
  isEmpty,
  fragmentUuids,
  width,
}: {
  children: React.ReactNode;
  sectionId: string;
  isEmpty: boolean;
  fragmentUuids: string[];
  width: number;
}) => {
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
  const { sequence: sequenceParam, density } = useSearch({ from });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleDensityChange = (next: OverviewDensity) => {
    void navigate({
      to: from,
      params: { projectId },
      search: (previous) => ({ ...previous, density: next }),
    });
  };

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedFragmentUuid, setSelectedFragmentUuid] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState<string>("");
  const [confirmingDeleteSectionId, setConfirmingDeleteSectionId] = useState<string | null>(null);
  const [hiddenAspectKeys, setHiddenAspectKeys] = useState<Set<string>>(new Set());

  const toggleAspectVisibility = useCallback((aspectKey: string) => {
    setHiddenAspectKeys((previous) => {
      const next = new Set(previous);
      if (next.has(aspectKey)) next.delete(aspectKey);
      else next.add(aspectKey);
      return next;
    });
  }, []);

  const { data: bundleEnvelope, isLoading: bundleLoading } = useListSequences(projectId);
  const bundle = bundleEnvelope?.status === 200 ? bundleEnvelope.data : undefined;

  const sequenceParamIsKnown = useMemo(
    () => bundle?.sequences.some((s) => s.uuid === sequenceParam) ?? false,
    [bundle, sequenceParam],
  );
  const activeSequenceId = sequenceParamIsKnown ? sequenceParam! : undefined;

  const { data: summariesEnvelope, isLoading: summariesLoading } =
    useListFragmentSummaries(projectId);

  const { data: aspectsEnvelope } = useListAspects(projectId);

  const sequence =
    bundle?.sequences.find((s) => s.uuid === activeSequenceId) ??
    bundle?.sequences.find((s) => s.isMain);
  const allFragments = summariesEnvelope?.status === 200 ? summariesEnvelope.data : [];
  const aspectList = aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : [];

  const colorByAspectKey = useMemo(() => {
    const map = new Map<string, string>();
    const seenKeys = new Set<string>();
    for (const aspect of aspectList) {
      map.set(aspect.key, resolveAspectColor(aspect.key, aspect.color));
      seenKeys.add(aspect.key);
    }
    // Cover aspect keys present on fragments but not (yet) in the aspects index —
    // fall back to the deterministic palette so the tile color matches the arc.
    for (const fragment of allFragments) {
      for (const aspectKey of Object.keys(fragment.aspects)) {
        if (!seenKeys.has(aspectKey)) {
          map.set(aspectKey, resolveAspectColor(aspectKey, undefined));
          seenKeys.add(aspectKey);
        }
      }
    }
    return map;
  }, [aspectList, allFragments]);

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

  const sequenceLayout = useMemo(
    () => computeSequenceLayout(sectionsData, density),
    [sectionsData, density],
  );

  // Stale-while-drag: hold the previously rendered arc series until the drag
  // ends. The user's optimistic in-flight reorderings still update tile DOM
  // positions, but the curve only catches up after `onDragEnd` clears
  // `activeDragId`. Avoids per-frame recomputation while the user drags.
  const arcSeriesCacheRef = useRef<ArcSeries[]>([]);
  const arcSeries = useMemo<ArcSeries[]>(() => {
    if (activeDragId !== null) return arcSeriesCacheRef.current;
    const next = buildArcSeries(
      sequenceLayout.sections.flatMap((section) => section.fragmentUuids),
      fragmentByUuid,
      sequenceLayout.centerByFragmentUuid,
      ARC_PANEL_HEIGHT,
    );
    arcSeriesCacheRef.current = next;
    return next;
  }, [activeDragId, sequenceLayout, fragmentByUuid]);

  const arcAspectKeys = useMemo(() => arcSeries.map((series) => series.aspectKey), [arcSeries]);
  const visibleArcSeries = useMemo(
    () => arcSeries.filter((series) => !hiddenAspectKeys.has(series.aspectKey)),
    [arcSeries, hiddenAspectKeys],
  );

  const sequenceByUuid = useMemo(
    () => new Map((bundle?.sequences ?? []).map((s) => [s.uuid, s])),
    [bundle],
  );

  const violationsByFragmentUuid = useMemo<Map<string, Violation[]>>(() => {
    if (!sequence?.isMain || !bundle?.violations?.length) return new Map();
    const map = new Map<string, Violation[]>();
    for (const violation of bundle.violations) {
      const existing = map.get(violation.fragmentUuid) ?? [];
      map.set(violation.fragmentUuid, [...existing, violation]);
    }
    return map;
  }, [sequence?.isMain, bundle?.violations]);

  const getViolationTooltips = useCallback(
    (fragmentUuid: string): string[] => {
      const violations = violationsByFragmentUuid.get(fragmentUuid);
      if (!violations) return [];
      return violations.map((violation) => {
        const predecessor = fragmentByUuid.get(violation.predecessorUuid);
        const secondary = sequenceByUuid.get(violation.secondaryUuid);
        return `Should appear after ${predecessor?.key ?? violation.predecessorUuid} (from ${secondary?.name ?? violation.secondaryUuid})`;
      });
    },
    [violationsByFragmentUuid, fragmentByUuid, sequenceByUuid],
  );

  const cycleTooltipByFragmentUuid = useMemo<Map<string, string[]>>(() => {
    if (!bundle?.cycles?.length) return new Map();
    const map = new Map<string, string[]>();
    for (const cycle of bundle.cycles) {
      const currentSequenceParticipates =
        sequence?.isMain || (sequence && cycle.sequenceUuids.includes(sequence.uuid));
      if (!currentSequenceParticipates) continue;
      const sequenceNames = cycle.sequenceUuids
        .map((uuid) => sequenceByUuid.get(uuid)?.name ?? uuid)
        .join(", ");
      const tooltip = `Cycle involving: ${sequenceNames}`;
      for (const fragmentUuid of cycle.fragmentUuids) {
        const existing = map.get(fragmentUuid) ?? [];
        if (!existing.includes(tooltip)) {
          map.set(fragmentUuid, [...existing, tooltip]);
        }
      }
    }
    return map;
  }, [bundle?.cycles, sequence, sequenceByUuid]);

  const getCycleTooltips = useCallback(
    (fragmentUuid: string): string[] => cycleTooltipByFragmentUuid.get(fragmentUuid) ?? [],
    [cycleTooltipByFragmentUuid],
  );

  const listQueryKey = getListSequencesQueryKey(projectId);

  const placeFragment = usePlaceFragment({
    mutation: {
      onMutate: async ({ sequenceId, data: { fragmentUuid, sectionUuid, position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticPlace(currentSequence, fragmentUuid, sectionUuid, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const moveFragment = useMoveFragment({
    mutation: {
      onMutate: async ({ sequenceId, fragmentUuid, data: { sectionUuid, position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticMove(currentSequence, fragmentUuid, sectionUuid, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const unplaceFragment = useUnplaceFragment({
    mutation: {
      onMutate: async ({ sequenceId, fragmentUuid }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticUnplace(currentSequence, fragmentUuid);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const designateMain = useDesignateSequenceMain({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const refreshActiveSequence = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey });
  }, [queryClient, listQueryKey]);

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

  const deleteSection = useDeleteSection({
    mutation: {
      onSuccess: () => {
        setConfirmingDeleteSectionId(null);
        refreshActiveSequence();
      },
    },
  });

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

      <div
        className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto"
        onClick={() => setSelectedFragmentUuid(null)}
      >
        {bundleLoading || summariesLoading ? (
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
              <div
                role="group"
                aria-label="Tile density"
                className="ml-auto flex items-center rounded border border-border overflow-hidden"
              >
                {(["full", "compact", "mini"] as const).map((tier) => {
                  const isActive = density === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleDensityChange(tier)}
                      className={`text-xs px-2 py-1 capitalize transition-colors ${
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {sequenceLayout.totalWidth > 0 && arcAspectKeys.length > 0 && (
                <ArcLegend
                  aspectKeys={arcAspectKeys}
                  colorByAspectKey={colorByAspectKey}
                  hiddenAspectKeys={hiddenAspectKeys}
                  onToggle={toggleAspectVisibility}
                />
              )}

              <div className="overflow-x-auto shrink-0">
                <div
                  className="flex flex-col gap-2"
                  style={{ width: sequenceLayout.totalWidth || undefined, minWidth: "100%" }}
                >
                  {sequenceLayout.totalWidth > 0 && (
                    <ArcPanel
                      width={sequenceLayout.totalWidth}
                      series={visibleArcSeries}
                      colorByAspectKey={colorByAspectKey}
                    />
                  )}
                  <div className="flex flex-row gap-3 items-start">
              {sectionsData.map((sectionData, sectionIndex) => (
                <section
                  key={sectionData.uuid}
                  className="flex flex-col gap-2 shrink-0"
                  style={{ width: sequenceLayout.sections[sectionIndex]?.width }}
                >
                  {confirmingDeleteSectionId === sectionData.uuid ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-muted-foreground">
                        Delete section?{" "}
                        {sectionData.fragmentUuids.length > 0 && (
                          <span>
                            {sectionData.fragmentUuids.length} fragment
                            {sectionData.fragmentUuids.length !== 1 ? "s" : ""} will return to the
                            pool.
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            sequence &&
                            deleteSection.mutate({
                              projectId,
                              sequenceId: sequence.uuid,
                              sectionId: sectionData.uuid,
                            })
                          }
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
                    <div className="group flex items-center gap-2">
                      {editingSectionId === sectionData.uuid ? (
                        <input
                          autoFocus
                          value={editingSectionValue}
                          onChange={(e) => setEditingSectionValue(e.target.value)}
                          onKeyDown={(e) =>
                            handleSectionRenameKeyDown(e, sectionData.uuid, sectionData.name)
                          }
                          onBlur={() =>
                            handleSectionRenameCommit(sectionData.uuid, editingSectionValue)
                          }
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
                      {sectionsData.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteSectionId(sectionData.uuid)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          aria-label={`Delete section "${sectionData.name || "Untitled section"}"`}
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
                  )}
                  <SectionZone
                    sectionId={sectionData.uuid}
                    isEmpty={sectionData.fragmentUuids.length === 0}
                    fragmentUuids={sectionData.fragmentUuids}
                    width={sequenceLayout.sections[sectionIndex]?.width ?? 0}
                  >
                    {sectionData.fragmentUuids.map((uuid) => {
                      const fragment = fragmentByUuid.get(uuid);
                      if (!fragment) return null;
                      return (
                        <SortableTile
                          key={uuid}
                          fragment={fragment}
                          inSequence={true}
                          density={density}
                          colorByAspectKey={colorByAspectKey}
                          violationTooltips={getViolationTooltips(uuid)}
                          cycleTooltips={getCycleTooltips(uuid)}
                          isSelected={selectedFragmentUuid === uuid}
                          onSelect={setSelectedFragmentUuid}
                        />
                      );
                    })}
                  </SectionZone>
                </section>
              ))}
                  </div>
                </div>
              </div>

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
                    return (
                      <SortableTile
                        key={uuid}
                        fragment={fragment}
                        inSequence={false}
                        density={density}
                        colorByAspectKey={colorByAspectKey}
                        cycleTooltips={getCycleTooltips(uuid)}
                        isSelected={selectedFragmentUuid === uuid}
                        onSelect={setSelectedFragmentUuid}
                      />
                    );
                  })}
                </PoolZone>
              </section>

              <DragOverlay dropAnimation={null}>
                {activeDragFragment ? (
                  <TileContent
                    fragment={activeDragFragment}
                    inSequence={fragmentSectionMap.has(activeDragFragment.uuid)}
                    density={density}
                    colorByAspectKey={colorByAspectKey}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </div>

      <RightSidebar
        fragment={selectedFragmentUuid ? fragmentByUuid.get(selectedFragmentUuid) : undefined}
        sequences={bundle?.sequences ?? []}
        violations={bundle?.violations ?? []}
        cycles={bundle?.cycles ?? []}
        fragmentByUuid={fragmentByUuid}
      />
    </div>
  );
};
