import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import type { OverviewDetailLevel } from "../../router";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay } from "@dnd-kit/core";

import {
  useListSequences,
  useDesignateSequenceMain,
  useGetSequenceContents,
  getListSequencesQueryKey,
  getGetSequenceContentsQueryKey,
} from "@api/generated/sequences/sequences";
import {
  useListFragmentSummaries,
  useUpdateFragment,
  getListFragmentSummariesQueryKey,
} from "@api/generated/fragments/fragments";
import { useListAspects } from "@api/generated/aspects/aspects";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
} from "@api/generated/projects/projects";
import type { Violation } from "@api/generated/maskorAPI.schemas";
import { useSequenceMutations } from "@lib/sequences/useSequenceMutations";
import { SequenceSidebar } from "./components/SequenceSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { SequenceHeader } from "./components/SequenceHeader";
import { ReorderList } from "./components/ReorderList";
import { ProseSpine } from "./components/ProseSpine";
import { ArcOverlay } from "./components/ArcOverlay";
import { VerticalArcStrip } from "./components/VerticalArcStrip";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { overviewScope } from "@lib/commands/scopes/overview";
import { usePersistedScroll } from "@hooks/usePersistedScroll";
import {
  writeOverviewSequence,
  writeOverviewSelection,
  overviewScrollKey,
  readOverviewSelection,
} from "@lib/nav-state";
import { useRebuildStatus } from "@contexts/RebuildStatusContext";
import { computeStepMoveTarget } from "@lib/sequences/stepMove";
import { useSectionManager } from "./hooks/useSectionManager";
import { useSequenceDnD } from "./hooks/useSequenceDnD";
import { useArcData } from "./hooks/useArcData";

export const OverviewPage = () => {
  const from = "/projects/$projectId/overview" as const;
  const { projectId } = useParams({ from });
  const { sequence: sequenceParam, detail: urlDetailLevel } = useSearch({ from });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projectEnvelope } = useGetProject(projectId);
  const project = projectEnvelope?.status === 200 ? projectEnvelope.data : undefined;
  const persistedDetailLevel = project?.overview?.detailLevel as OverviewDetailLevel | undefined;

  const detailLevel: OverviewDetailLevel = urlDetailLevel ?? persistedDetailLevel ?? "prose";

  const { mutate: updateProject } = useUpdateProject({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });

  const handleSetDetailLevel = useCallback(
    (next: OverviewDetailLevel) => {
      updateProject({ projectId, data: { overview: { detailLevel: next } } });
      void navigate({
        to: from,
        params: { projectId },
        search: (previous) => ({ ...previous, detail: next }),
      });
    },
    [updateProject, navigate, projectId],
  );

  // Multi-selection on the reorder list. `selection` holds every selected
  // fragment (for group/move/split); the primary (last-selected) drives the
  // right detail panel and keyboard movement. `selectionAnchor` is the pivot for
  // shift-range selection.
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const primarySelectedUuid = selection.at(-1) ?? null;
  const [arcOverlayOpen, setArcOverlayOpen] = useState(false);
  const [arcExpanded, setArcExpanded] = useState(false);
  const [verticalStripOpen, setVerticalStripOpen] = useState(false);

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

  const { data: contentsEnvelope } = useGetSequenceContents(projectId, sequence?.uuid ?? "", {
    query: { enabled: !!sequence },
  });
  const contentByFragmentUuid = useMemo(() => {
    const map = new Map<string, string>();
    if (contentsEnvelope?.status !== 200) return map;
    for (const entry of [...contentsEnvelope.data.placed, ...contentsEnvelope.data.pool]) {
      map.set(entry.fragmentUuid, entry.content);
    }
    return map;
  }, [contentsEnvelope]);

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

  // Order used for shift-range selection: placed fragments in sequence order,
  // then the pool.
  const visibleOrder = useMemo(
    () => [...allSequenceFragmentUuids, ...poolFragmentUuids],
    [allSequenceFragmentUuids, poolFragmentUuids],
  );

  const clearSelection = useCallback(() => {
    setSelection([]);
    setSelectionAnchor(null);
  }, []);

  const handleSelectFragment = useCallback(
    (fragmentUuid: string, modifiers?: { toggle?: boolean; range?: boolean }) => {
      if (modifiers?.range && selectionAnchor) {
        const anchorIndex = visibleOrder.indexOf(selectionAnchor);
        const targetIndex = visibleOrder.indexOf(fragmentUuid);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] =
            anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          setSelection(visibleOrder.slice(start, end + 1));
          return;
        }
      }
      if (modifiers?.toggle) {
        setSelection((previous) =>
          previous.includes(fragmentUuid)
            ? previous.filter((uuid) => uuid !== fragmentUuid)
            : [...previous, fragmentUuid],
        );
        setSelectionAnchor(fragmentUuid);
        return;
      }
      setSelection([fragmentUuid]);
      setSelectionAnchor(fragmentUuid);
    },
    [selectionAnchor, visibleOrder],
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

  // In-context editing: save a fragment's edited markdown body via the shared
  // fragment update path, then refresh the spine content and summaries so the
  // edited chunk (and its excerpt) reflow. The selection→fragment mapping is the
  // fragmentUuid the editor was opened for (each chunk owns its own editor).
  const { mutateAsync: updateFragmentContent } = useUpdateFragment();

  const handleSaveFragmentContent = useCallback(
    async (fragmentUuid: string, content: string) => {
      await updateFragmentContent({ projectId, fragmentId: fragmentUuid, data: { content } });
      if (sequence) {
        void queryClient.invalidateQueries({
          queryKey: getGetSequenceContentsQueryKey(projectId, sequence.uuid),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: getListFragmentSummariesQueryKey(projectId),
      });
    },
    [updateFragmentContent, projectId, sequence, queryClient],
  );

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
      if (!primarySelectedUuid || !sequence || dnd.activeDragId) return;

      const target = computeStepMoveTarget(sectionsData, primarySelectedUuid, direction);
      if (!target) return;

      sequenceMutations.moveFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid: primarySelectedUuid,
        data: { sectionUuid: target.sectionUuid, position: target.position },
      });
    },
    [primarySelectedUuid, sequence, sectionsData, projectId, sequenceMutations, dnd.activeDragId],
  );

  const handleSectionKeyboardMove = useCallback(
    (direction: "prev" | "next") => {
      if (!primarySelectedUuid || !sequence || dnd.activeDragId) return;
      const currentSectionIndex = sectionsData.findIndex((s) =>
        s.fragmentUuids.includes(primarySelectedUuid),
      );
      if (currentSectionIndex === -1) return;
      const targetIndex = direction === "prev" ? currentSectionIndex - 1 : currentSectionIndex + 1;
      if (targetIndex < 0 || targetIndex >= sectionsData.length) return;
      const sectionId = sectionsData[currentSectionIndex]!.uuid;
      sequenceMutations.moveSection.mutate({
        projectId,
        sequenceId: sequence.uuid,
        sectionId,
        data: { position: targetIndex },
      });
    },
    [primarySelectedUuid, sequence, sectionsData, projectId, sequenceMutations, dnd.activeDragId],
  );

  const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (event.shiftKey && event.key === "ArrowUp") {
      event.preventDefault();
      handleSectionKeyboardMove("prev");
    } else if (event.shiftKey && event.key === "ArrowDown") {
      event.preventDefault();
      handleSectionKeyboardMove("next");
    } else if (!event.shiftKey && event.key === "ArrowUp") {
      event.preventDefault();
      handleFragmentKeyboardMove("prev");
    } else if (!event.shiftKey && event.key === "ArrowDown") {
      event.preventDefault();
      handleFragmentKeyboardMove("next");
    }
  };

  const arcData = useArcData({
    fragmentByUuid,
    aspectList,
    allFragments,
    placedFragmentUuids: allSequenceFragmentUuids,
  });

  // --- view-state persistence ---

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const persistedScroll = usePersistedScroll(overviewScrollKey(projectId));

  // Persist sequence when it changes.
  useEffect(() => {
    if (activeSequenceId) writeOverviewSequence(projectId, activeSequenceId);
  }, [projectId, activeSequenceId]);

  // Restore selection on mount runs after this persist effect in source order, so
  // guard persistence until restore has completed — otherwise the initial empty
  // selection would overwrite the stored value before it can be read back.
  const hasRestoredSelectionRef = useRef(false);

  // Persist selection when it changes (only after restore, see above).
  useEffect(() => {
    if (!hasRestoredSelectionRef.current) return;
    writeOverviewSelection(projectId, selection);
  }, [projectId, selection]);

  // Restore scroll only once the content that determines scroll height is ready.
  // The spine height comes from the sequence-contents query, not from the bundle
  // or summaries; restoring on the latter would clamp scrollTop against a
  // not-yet-grown container. When there is no sequence, fall back to the bundle/
  // summaries readiness so an empty project still restores (a no-op scroll).
  const spineContentReady =
    !bundleLoading && !summariesLoading && (!sequence || !!contentsEnvelope);
  const hasRestoredScrollRef = useRef(false);
  useEffect(() => {
    if (!spineContentReady || hasRestoredScrollRef.current) return;
    hasRestoredScrollRef.current = true;
    const offset = persistedScroll.read();
    if (offset === null) return;
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = offset;
    });
  }, [spineContentReady, persistedScroll]);

  // Restore selection after fragments are loaded, filtered to still-existing UUIDs.
  useEffect(() => {
    if (summariesLoading || hasRestoredSelectionRef.current) return;
    hasRestoredSelectionRef.current = true;
    const stored = readOverviewSelection(projectId);
    if (stored.length === 0) return;
    const valid = stored.filter((uuid) => fragmentByUuid.has(uuid));
    if (valid.length > 0) {
      setSelection(valid);
      setSelectionAnchor(valid.at(-1) ?? null);
    }
  }, [summariesLoading, projectId, fragmentByUuid]);

  const commands = useCommands();

  const toggleArcOverlay = useCallback(() => setArcOverlayOpen((open) => !open), []);
  const toggleArcExpanded = useCallback(() => setArcExpanded((expanded) => !expanded), []);
  const toggleVerticalArcStrip = useCallback(() => setVerticalStripOpen((open) => !open), []);

  // Only the placed members of the selection participate in section operations.
  const placedSelection = useMemo(
    () => selection.filter((uuid) => fragmentSectionMap.has(uuid)),
    [selection, fragmentSectionMap],
  );

  // Split operates on a single placed fragment. The backend op splits *before*
  // the given fragment; "split after X" is the same op applied to the next
  // fragment in X's section.
  const splitContext = useMemo(() => {
    if (placedSelection.length !== 1) return undefined;
    const fragmentUuid = placedSelection[0]!;
    const section = sectionsData.find((s) => s.fragmentUuids.includes(fragmentUuid));
    if (!section) return undefined;
    const index = section.fragmentUuids.indexOf(fragmentUuid);
    return {
      fragmentUuid,
      nextFragmentUuid: section.fragmentUuids[index + 1],
      isFirst: index === 0,
      isLast: index === section.fragmentUuids.length - 1,
    };
  }, [placedSelection, sectionsData]);

  const canSplitBefore = !!splitContext && !splitContext.isFirst;
  const canSplitAfter = !!splitContext && !splitContext.isLast;

  const groupSelection = useCallback(async () => {
    if (!sequence || placedSelection.length < 1) return;
    await sequenceMutations.groupFragments.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuids: placedSelection, name: "" },
    });
  }, [sequence, placedSelection, projectId, sequenceMutations]);

  const splitBefore = useCallback(async () => {
    if (!sequence || !splitContext || splitContext.isFirst) return;
    await sequenceMutations.splitSection.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuid: splitContext.fragmentUuid, name: "" },
    });
  }, [sequence, splitContext, projectId, sequenceMutations]);

  const splitAfter = useCallback(async () => {
    if (!sequence || !splitContext || splitContext.isLast || !splitContext.nextFragmentUuid) return;
    await sequenceMutations.splitSection.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuid: splitContext.nextFragmentUuid, name: "" },
    });
  }, [sequence, splitContext, projectId, sequenceMutations]);

  const moveSelectionToSection = useCallback(
    async (sectionUuid: string) => {
      if (!sequence || placedSelection.length < 1) return;
      const targetSection = sectionsData.find((s) => s.uuid === sectionUuid);
      const position = targetSection?.fragmentUuids.length ?? 0;
      await sequenceMutations.moveFragments.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        data: { fragmentUuids: placedSelection, sectionUuid, position },
      });
    },
    [sequence, placedSelection, sectionsData, projectId, sequenceMutations],
  );

  const sectionsForMove = useMemo(
    () => sectionsData.map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );

  // Merge dissolves a section boundary by fusing a section with the one below it
  // (the backend op). "Merge up" applies it to the previous section; "down" to
  // this one. A section can merge up if it has a predecessor, down if a successor.
  const mergeableUpSections = useMemo(
    () => sectionsData.slice(1).map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );
  const mergeableDownSections = useMemo(
    () => sectionsData.slice(0, -1).map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );

  const mergeSectionUp = useCallback(
    async (sectionUuid: string) => {
      if (!sequence) return;
      const index = sectionsData.findIndex((s) => s.uuid === sectionUuid);
      if (index <= 0) return;
      await sequenceMutations.mergeSection.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        sectionId: sectionsData[index - 1]!.uuid,
      });
    },
    [sequence, sectionsData, projectId, sequenceMutations],
  );

  const mergeSectionDown = useCallback(
    async (sectionUuid: string) => {
      if (!sequence) return;
      const index = sectionsData.findIndex((s) => s.uuid === sectionUuid);
      if (index === -1 || index >= sectionsData.length - 1) return;
      await sequenceMutations.mergeSection.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        sectionId: sectionUuid,
      });
    },
    [sequence, sectionsData, projectId, sequenceMutations],
  );

  // Unplace a single fragment from the active sequence, returning it to the
  // pool. Shares the optimistic mutation used by drag-to-pool; surfaced as a
  // direct button on each placed fragment (spine, left column, right panel).
  const unplaceFragment = useCallback(
    (fragmentUuid: string) => {
      if (!sequence) return;
      sequenceMutations.unplaceFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid,
      });
    },
    [sequence, projectId, sequenceMutations],
  );

  const placedFragmentsForUnplace = useMemo(
    () =>
      allSequenceFragmentUuids.map((uuid) => ({
        uuid,
        key: fragmentByUuid.get(uuid)?.key ?? uuid,
      })),
    [allSequenceFragmentUuids, fragmentByUuid],
  );

  // Per-fragment "remove from sequence" trigger shared by the spine, the left
  // column, and the right panel. Dispatches the parameterized unplace command
  // with the fragment's key so the palette entry reads sensibly too.
  const handleRemoveFragment = useCallback(
    (fragmentUuid: string) =>
      commands.run("overview:unplace-fragment", {
        uuid: fragmentUuid,
        key: fragmentByUuid.get(fragmentUuid)?.key ?? fragmentUuid,
      }),
    [commands, fragmentByUuid],
  );

  useCommandScope(overviewScope, {
    canDesignateMain: !!sequence && !sequence.isMain,
    designateMain: () =>
      sequence
        ? designateMain.mutateAsync({ projectId, sequenceId: sequence.uuid }).then(() => {})
        : Promise.resolve(),
    createSectionPending: sectionManager.createSection.isPending,
    createSection: () =>
      sequence
        ? sectionManager.createSection
            .mutateAsync({ projectId, sequenceId: sequence.uuid, data: { name: "" } })
            .then(() => {})
        : Promise.resolve(),
    confirmingDeleteSectionId: sectionManager.confirmingDeleteSectionId,
    deleteSection: () =>
      sequence && sectionManager.confirmingDeleteSectionId
        ? sectionManager.deleteSection
            .mutateAsync({
              projectId,
              sequenceId: sequence.uuid,
              sectionId: sectionManager.confirmingDeleteSectionId,
            })
            .then(() => {})
        : Promise.resolve(),
    detailLevel,
    setDetailLevel: handleSetDetailLevel,
    arcOverlayOpen,
    toggleArcOverlay,
    toggleArcExpanded,
    toggleVerticalArcStrip,
    placedSelectionCount: placedSelection.length,
    groupSelection,
    canSplitBefore,
    splitBefore,
    canSplitAfter,
    splitAfter,
    sectionsForMove,
    moveSelectionToSection,
    mergeableUpSections,
    mergeableDownSections,
    mergeSectionUp,
    mergeSectionDown,
    placedFragmentsForUnplace,
    unplaceFragment,
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

      {/* Two independent DnD contexts share the same handlers. The reorder list
          and the prose spine both use raw fragment uuids as draggable ids;
          dnd-kit ids must be unique within a context, so the surfaces are kept
          in separate contexts rather than colliding in one. */}
      {!bundleLoading && !summariesLoading && (
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={dnd.collisionDetection}
          onDragStart={dnd.handleDragStart}
          onDragEnd={dnd.handleDragEnd}
        >
          <aside className="w-64 shrink-0 border-r border-border overflow-y-auto p-3">
            <ReorderList
              sectionsData={sectionsData}
              poolFragmentUuids={poolFragmentUuids}
              colorByAspectKey={arcData.colorByAspectKey}
              fragmentByUuid={fragmentByUuid}
              selectedFragmentUuids={selectionSet}
              onSelectFragment={handleSelectFragment}
              onRemoveFragment={handleRemoveFragment}
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
              onMergeUp={(section) => commands.run("overview:merge-section-up", section)}
              onMergeDown={(section) => commands.run("overview:merge-section-down", section)}
              hasSequence={!!sequence}
              createSectionPending={sectionManager.createSection.isPending}
              onAddSection={() => commands.run("overview:add-section")}
            />
          </aside>
          <DragOverlay dropAnimation={null}>
            {activeDragFragment ? (
              <div className="rounded border border-primary bg-card px-2 py-1 text-xs font-medium shadow">
                {activeDragFragment.key}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex flex-col gap-6 p-4 overflow-y-auto"
        data-testid="overview-main-content"
        onClick={clearSelection}
        onKeyDown={handleMainKeyDown}
        onScroll={() => {
          if (scrollContainerRef.current)
            persistedScroll.save(scrollContainerRef.current.scrollTop);
        }}
      >
        {(bundleLoading || summariesLoading) && isRebuilding ? (
          <p className="text-sm text-muted-foreground">Rebuilding project index…</p>
        ) : bundleLoading || summariesLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <SequenceHeader
              sequence={sequence}
              detailLevel={detailLevel}
              designateMainPending={designateMain.isPending}
              onDesignateMain={() => commands.run("overview:designate-main")}
              onSetDetailLevel={handleSetDetailLevel}
              arcOverlayOpen={arcOverlayOpen}
              onToggleArcOverlay={toggleArcOverlay}
              verticalStripOpen={verticalStripOpen}
              onToggleVerticalStrip={toggleVerticalArcStrip}
            />

            {placedSelection.length > 0 && (
              <div
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                data-testid="selection-action-bar"
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {placedSelection.length} selected
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => commands.run("overview:group-selection")}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Group into section
                  </button>
                  <button
                    type="button"
                    onClick={() => commands.run("overview:split-before-selection")}
                    disabled={!canSplitBefore}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Split before
                  </button>
                  <button
                    type="button"
                    onClick={() => commands.run("overview:split-after-selection")}
                    disabled={!canSplitAfter}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Split after
                  </button>
                  {/* "Move to section…" is a parameterized command (opens a section
                      picker); run it from the command palette. */}
                </div>
              </div>
            )}

            {arcOverlayOpen && (
              <ArcOverlay
                sectionsData={sectionsData}
                fragmentByUuid={fragmentByUuid}
                colorByAspectKey={arcData.colorByAspectKey}
                arcAspectKeys={arcData.arcAspectKeys}
                hiddenAspectKeys={arcData.hiddenAspectKeys}
                onToggleAspectVisibility={arcData.toggleAspectVisibility}
                isExpanded={arcExpanded}
                onToggleExpanded={toggleArcExpanded}
                onClose={toggleArcOverlay}
              />
            )}

            <DndContext
              sensors={dnd.sensors}
              collisionDetection={dnd.collisionDetection}
              onDragStart={dnd.handleDragStart}
              onDragEnd={dnd.handleDragEnd}
            >
              <div className="flex gap-4">
                {verticalStripOpen && (
                  <div className="sticky top-0 self-start">
                    <VerticalArcStrip
                      orderedFragmentUuids={allSequenceFragmentUuids}
                      fragmentByUuid={fragmentByUuid}
                      colorByAspectKey={arcData.colorByAspectKey}
                      hiddenAspectKeys={arcData.hiddenAspectKeys}
                    />
                  </div>
                )}
                <div className="flex-1">
                  <ProseSpine
                    projectId={projectId}
                    sectionsData={sectionsData}
                    detailLevel={detailLevel}
                    fragmentByUuid={fragmentByUuid}
                    contentByFragmentUuid={contentByFragmentUuid}
                    selectedFragmentUuids={selectionSet}
                    onSelectFragment={handleSelectFragment}
                    onRemoveFragment={handleRemoveFragment}
                    onSaveContent={handleSaveFragmentContent}
                  />
                </div>
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDragFragment ? (
                  <div className="rounded border border-primary bg-card px-2 py-1 text-xs font-medium shadow">
                    {activeDragFragment.key}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </div>

      <RightSidebar
        fragment={primarySelectedUuid ? fragmentByUuid.get(primarySelectedUuid) : undefined}
        sequences={bundle?.sequences ?? []}
        violations={bundle?.violations ?? []}
        cycles={bundle?.cycles ?? []}
        fragmentByUuid={fragmentByUuid}
        selectedContent={
          primarySelectedUuid ? contentByFragmentUuid.get(primarySelectedUuid) : undefined
        }
        onSaveContent={handleSaveFragmentContent}
        // Only offer "remove from sequence" when the selected fragment is placed
        // in the active sequence (the unplace target).
        onRemoveFragment={
          primarySelectedUuid && fragmentSectionMap.has(primarySelectedUuid)
            ? handleRemoveFragment
            : undefined
        }
      />
    </div>
  );
};
