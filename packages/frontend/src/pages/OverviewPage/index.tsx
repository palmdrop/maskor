import { useState, useMemo, useCallback } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import type { OverviewDensity } from "../../router";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay } from "@dnd-kit/core";

import {
  useListSequences,
  useDesignateSequenceMain,
  getListSequencesQueryKey,
} from "@api/generated/sequences/sequences";
import { useListFragmentSummaries } from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
} from "@api/generated/projects/projects";
import type { Violation } from "@api/generated/maskorAPI.schemas";
import { useSequenceMutations } from "@lib/sequences/useSequenceMutations";
import { TileContent } from "./components/TileContent";
import { SequenceSidebar } from "./components/SequenceSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { ArcPanel } from "./components/ArcPanel";
import { ArcLegend } from "./components/ArcLegend";
import { PoolZone } from "./components/PoolZone";
import { SortableTile } from "./components/SortableTile";
import { SequenceHeader } from "./components/SequenceHeader";
import { SequenceSections } from "./components/SequenceSections";
import { computeSequenceLayout } from "./utils/layout";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { overviewScope } from "@lib/commands/scopes/overview";
import { useRebuildStatus } from "@contexts/RebuildStatusContext";
import { useSectionManager } from "./hooks/useSectionManager";
import { useSequenceDnD } from "./hooks/useSequenceDnD";
import { useArcData } from "./hooks/useArcData";

export const OverviewPage = () => {
  const from = "/projects/$projectId/overview" as const;
  const { projectId } = useParams({ from });
  const { sequence: sequenceParam, density: urlDensity } = useSearch({ from });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projectEnvelope } = useGetProject(projectId);
  const project = projectEnvelope?.status === 200 ? projectEnvelope.data : undefined;
  const persistedDensity = project?.overview?.density as OverviewDensity | undefined;

  const density: OverviewDensity = urlDensity ?? persistedDensity ?? "full";

  const { mutate: updateProject } = useUpdateProject({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });

  const handleDensityChange = (next: OverviewDensity) => {
    updateProject({ projectId, data: { overview: { density: next } } });
    void navigate({
      to: from,
      params: { projectId },
      search: (previous) => ({ ...previous, density: next }),
    });
  };

  const [selectedFragmentUuid, setSelectedFragmentUuid] = useState<string | null>(null);

  const { isRebuilding } = useRebuildStatus();

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

  const sequenceMutations = useSequenceMutations(listQueryKey);

  const designateMain = useDesignateSequenceMain({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
    },
  });

  const sectionManager = useSectionManager({ projectId, sequence, listQueryKey });

  const dnd = useSequenceDnD({
    sequence,
    projectId,
    sectionsData,
    poolFragmentUuids,
    fragmentSectionMap,
    mutations: sequenceMutations,
  });

  const handleFragmentKeyboardMove = useCallback(
    (direction: "prev" | "next") => {
      if (!selectedFragmentUuid || !sequence || dnd.activeDragId) return;

      const currentSectionIndex = sectionsData.findIndex((s) =>
        s.fragmentUuids.includes(selectedFragmentUuid),
      );
      if (currentSectionIndex === -1) return;

      const currentSection = sectionsData[currentSectionIndex];
      const currentPositionInSection = currentSection.fragmentUuids.indexOf(selectedFragmentUuid);

      let targetSectionIndex: number;
      let targetPosition: number;

      if (direction === "prev") {
        if (currentPositionInSection > 0) {
          targetSectionIndex = currentSectionIndex;
          targetPosition = currentPositionInSection - 1;
        } else if (currentSectionIndex > 0) {
          targetSectionIndex = currentSectionIndex - 1;
          targetPosition = sectionsData[targetSectionIndex].fragmentUuids.length;
        } else {
          return;
        }
      } else {
        if (currentPositionInSection < currentSection.fragmentUuids.length - 1) {
          targetSectionIndex = currentSectionIndex;
          targetPosition = currentPositionInSection + 1;
        } else if (currentSectionIndex < sectionsData.length - 1) {
          targetSectionIndex = currentSectionIndex + 1;
          targetPosition = 0;
        } else {
          return;
        }
      }

      const targetSection = sectionsData[targetSectionIndex];
      sequenceMutations.moveFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid: selectedFragmentUuid,
        data: { sectionUuid: targetSection.uuid, position: targetPosition },
      });
    },
    [selectedFragmentUuid, sequence, sectionsData, projectId, sequenceMutations, dnd.activeDragId],
  );

  const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      handleFragmentKeyboardMove("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      handleFragmentKeyboardMove("next");
    }
  };

  const arcData = useArcData({
    activeDragId: dnd.activeDragId,
    sequenceLayout,
    fragmentByUuid,
    aspectList,
    allFragments,
  });

  const commands = useCommands();

  useCommandScope(overviewScope, {
    canDesignateMain: !!sequence && !sequence.isMain,
    designateMain: () => {
      if (sequence) designateMain.mutate({ projectId, sequenceId: sequence.uuid });
    },
    createSectionPending: sectionManager.createSection.isPending,
    createSection: () => {
      if (sequence)
        sectionManager.createSection.mutate({
          projectId,
          sequenceId: sequence.uuid,
          data: { name: "" },
        });
    },
    confirmingDeleteSectionId: sectionManager.confirmingDeleteSectionId,
    deleteSection: () => {
      if (sequence && sectionManager.confirmingDeleteSectionId) {
        sectionManager.deleteSection.mutate({
          projectId,
          sequenceId: sequence.uuid,
          sectionId: sectionManager.confirmingDeleteSectionId,
        });
      }
    },
  });

  const activeDragFragment = dnd.activeDragId ? fragmentByUuid.get(dnd.activeDragId) : undefined;

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

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto"
        data-testid="overview-main-content"
        onClick={() => setSelectedFragmentUuid(null)}
        onKeyDown={handleMainKeyDown}
      >
        {(bundleLoading || summariesLoading) && isRebuilding ? (
          <p className="text-sm text-muted-foreground">Rebuilding project index…</p>
        ) : bundleLoading || summariesLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <SequenceHeader
              sequence={sequence}
              density={density}
              designateMainPending={designateMain.isPending}
              onDesignateMain={() => commands.run("overview:designate-main")}
              onDensityChange={handleDensityChange}
            />

            <DndContext
              sensors={dnd.sensors}
              collisionDetection={dnd.collisionDetection}
              onDragStart={dnd.handleDragStart}
              onDragEnd={dnd.handleDragEnd}
            >
              {sequenceLayout.totalWidth > 0 && arcData.arcAspectKeys.length > 0 && (
                <ArcLegend
                  aspectKeys={arcData.arcAspectKeys}
                  colorByAspectKey={arcData.colorByAspectKey}
                  hiddenAspectKeys={arcData.hiddenAspectKeys}
                  onToggle={arcData.toggleAspectVisibility}
                />
              )}

              {sequenceLayout.totalWidth > 0 && (
                <div
                  ref={arcData.arcScrollerRef}
                  className="overflow-x-hidden shrink-0 sticky top-0 z-10"
                >
                  <ArcPanel
                    width={sequenceLayout.totalWidth}
                    series={arcData.visibleArcSeries}
                    colorByAspectKey={arcData.colorByAspectKey}
                  />
                </div>
              )}

              <SequenceSections
                ref={arcData.tileScrollerRef}
                sectionsData={sectionsData}
                sequenceLayout={sequenceLayout}
                density={density}
                colorByAspectKey={arcData.colorByAspectKey}
                fragmentByUuid={fragmentByUuid}
                selectedFragmentUuid={selectedFragmentUuid}
                onSelectFragment={setSelectedFragmentUuid}
                getViolationTooltips={getViolationTooltips}
                getCycleTooltips={getCycleTooltips}
                editingSectionId={sectionManager.editingSectionId}
                setEditingSectionId={sectionManager.setEditingSectionId}
                editingSectionValue={sectionManager.editingSectionValue}
                setEditingSectionValue={sectionManager.setEditingSectionValue}
                confirmingDeleteSectionId={sectionManager.confirmingDeleteSectionId}
                setConfirmingDeleteSectionId={sectionManager.setConfirmingDeleteSectionId}
                handleSectionRenameCommit={sectionManager.handleSectionRenameCommit}
                handleSectionRenameKeyDown={sectionManager.handleSectionRenameKeyDown}
                onDeleteSection={() => commands.run("overview:delete-section")}
                hasSequence={!!sequence}
                createSectionPending={sectionManager.createSection.isPending}
                onAddSection={() => commands.run("overview:add-section")}
                onScroll={arcData.handleTileScroll}
              />

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
                        density={density}
                        colorByAspectKey={arcData.colorByAspectKey}
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
                    density={density}
                    colorByAspectKey={arcData.colorByAspectKey}
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
