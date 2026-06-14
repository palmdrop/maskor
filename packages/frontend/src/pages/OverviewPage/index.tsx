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
import { isSequenceReadOnly } from "@lib/sequences/readOnly";
import { isTextEntryTarget } from "@lib/keyboard";
import { SequenceSidebar } from "./components/SequenceSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { SequenceHeader } from "./components/SequenceHeader";
import { ReorderList } from "./components/ReorderList";
import { ProseSpine } from "./components/ProseSpine";
import { fragmentAnchorId } from "./components/FragmentProse";
import { FragmentEditor } from "@components/fragments/fragment-editor";
import { SplitFragmentDialog } from "@components/fragments/SplitFragmentDialog";
import { Button } from "@components/ui/button";
import { fragmentNavScope } from "@lib/commands/scopes/fragment-nav";
import { overviewEditOrder } from "@lib/fragments/order-neighbors";
import { ArcOverlay } from "./components/ArcOverlay";
import { VerticalArcStrip } from "./components/VerticalArcStrip";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { overviewScope } from "@lib/commands/scopes/overview";
import { usePersistedScroll } from "@hooks/usePersistedScroll";
import { useFragmentAnchor } from "@hooks/useFragmentAnchor";
import {
  writeOverviewSequence,
  overviewScrollKey,
  readOverviewAuthoredAnchor,
  writeOverviewAuthoredAnchor,
} from "@lib/nav-state";
import { resolveOverviewLoadScroll } from "./utils/loadScroll";
import { useRebuildStatus } from "@contexts/RebuildStatusContext";
import { computeStepMoveTarget } from "@lib/sequences/stepMove";
import { useSectionManager } from "./hooks/useSectionManager";
import { useSequenceDnD } from "./hooks/useSequenceDnD";
import { useArcData } from "./hooks/useArcData";
import { useFragmentSelection } from "./hooks/useFragmentSelection";
import { useOverviewInlineEditor } from "./hooks/useOverviewInlineEditor";
import { useSectionOps } from "./hooks/useSectionOps";
import { useProjectEditorConfig } from "../../hooks/useProjectEditorConfig";

export const OverviewPage = () => {
  const from = "/projects/$projectId/overview" as const;
  const { projectId } = useParams({ from });
  const { sequence: sequenceParam, detail: urlDetailLevel } = useSearch({ from });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const vimMode = useProjectEditorConfig(projectId).vimMode;

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
  // An import-sequence (origin set) is a read-only snapshot: arranging and
  // section editing are disabled, mirroring the backend guard. To build on it
  // the user clones it.
  const sequenceReadOnly = sequence ? isSequenceReadOnly(sequence) : false;
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

  const { selection, selectionSet, primarySelectedUuid, handleSelectFragment, clearSelection } =
    useFragmentSelection({ projectId, visibleOrder, fragmentByUuid, summariesLoading });

  // Anchor navigation for the spine. `ready: false` disables the hook's own
  // deep-link scroll — the Overview drives load scrolling itself so the
  // remembered scroll position can win over a leftover anchor (see the restore
  // effect below). We only use the hook's click-time `navigateToAnchor` (sets
  // `#fragment-<uuid>` + scrolls) and the parsed `activeAnchorId`.
  const { activeAnchorId, navigateToAnchor } = useFragmentAnchor({ ready: false });

  // Reveal a fragment in the spine and record the anchor as authored-in-this-tab,
  // so a later reload tells it apart from an external deep link (scroll wins for
  // our own clicks; the deep link wins).
  const scrollToFragment = useCallback(
    (fragmentUuid: string) => {
      writeOverviewAuthoredAnchor(projectId, fragmentUuid);
      navigateToAnchor(fragmentUuid);
    },
    [projectId, navigateToAnchor],
  );

  // Wraps selection for the left ordering column: a plain click selects AND
  // scrolls the spine to that fragment. Modifier clicks (cmd/shift multi-select)
  // only adjust the selection — no scroll, no anchor change. The spine itself
  // keeps using `handleSelectFragment` directly so clicking prose never scrolls.
  const handleSidebarSelectFragment = useCallback(
    (fragmentUuid: string, modifiers?: { toggle?: boolean; range?: boolean }) => {
      handleSelectFragment(fragmentUuid, modifiers);
      if (!modifiers?.toggle && !modifiers?.range) scrollToFragment(fragmentUuid);
    },
    [handleSelectFragment, scrollToFragment],
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

  // In-context editing (ADR 0013): double-click / pencil opens the full fragment
  // editor as a center-replacing overlay (the spine is hidden, not unmounted — see
  // the overlay JSX — so the host sidebars stay). The overlay's own state machine
  // (open / retarget / dirty-guard / close / scroll-back) lives in
  // useOverviewInlineEditor, wired up below once spineContentReady is known.
  //
  // Previous/Next traverses the placed fragments in spine order, excluding the
  // unassigned pool (already absent from allSequenceFragmentUuids) and discarded
  // fragments.
  const overviewOrder = useMemo(
    () => overviewEditOrder(allSequenceFragmentUuids, fragmentByUuid),
    [allSequenceFragmentUuids, fragmentByUuid],
  );

  // After an editor save, refresh the spine content + summaries so the edited
  // body (and its excerpt) reflow once the overlay is closed.
  const handleEditorSaved = useCallback(() => {
    if (sequence) {
      void queryClient.invalidateQueries({
        queryKey: getGetSequenceContentsQueryKey(projectId, sequence.uuid),
      });
    }
    void queryClient.invalidateQueries({
      queryKey: getListFragmentSummariesQueryKey(projectId),
    });
  }, [sequence, projectId, queryClient]);

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

  // The surface (sidebar or spine container) whose keyboard move is in flight, so
  // the effect below can restore focus to the moved fragment within it. A
  // cross-section move unmounts the old row, dropping focus and stalling repeated
  // ↑/↓ — re-focusing keeps the keyboard sort going.
  const keyboardMoveSurfaceRef = useRef<HTMLElement | null>(null);

  // Shared by the sidebar and the spine: ↑/↓ sort the selected fragment, Shift+↑/↓
  // its section. Bound to both surfaces (not the whole page) so the keys only act
  // while focus is in one of them — elsewhere ↑/↓ still scroll. Skipped while
  // editing so it never clashes with the editor or the placement modal.
  const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingFragmentUuid) return;
    if (isTextEntryTarget(event.target as HTMLElement)) return;

    const isArrowUp = event.key === "ArrowUp" || (vimMode && event.key.toLowerCase() === "k");
    const isArrowDown = event.key === "ArrowDown" || (vimMode && event.key.toLowerCase() === "j");
    if (!isArrowUp && !isArrowDown) return;

    event.preventDefault();
    keyboardMoveSurfaceRef.current = event.currentTarget;

    if (event.shiftKey) {
      handleSectionKeyboardMove(isArrowUp ? "prev" : "next");
    } else {
      handleFragmentKeyboardMove(isArrowUp ? "prev" : "next");
    }
  };

  // Restore focus to the moved fragment after the list re-renders (see the ref).
  // In the reorder column the row is dnd-kit-focusable, so `focus()` lands on it
  // and the next keystroke reaches the row→aside handler. In the spine the prose
  // block is intentionally not focusable, so `focus()` is a no-op there — focus
  // stays on the scroll container (which carries the same handler), so repeated
  // ↑/↓ keep sorting regardless. `scrollIntoView` keeps the row in view either way.
  useEffect(() => {
    const surface = keyboardMoveSurfaceRef.current;
    if (!surface || !primarySelectedUuid) return;
    keyboardMoveSurfaceRef.current = null;

    const node = surface.querySelector<HTMLElement>(
      `[data-fragment-uuid="${primarySelectedUuid}"]`,
    );
    node?.focus();
    node?.scrollIntoView({ block: "nearest" });
  }, [sectionsData, primarySelectedUuid]);

  const arcData = useArcData({
    fragmentByUuid,
    aspectList,
    allFragments,
    placedFragmentUuids: allSequenceFragmentUuids,
  });

  // --- view-state persistence ---

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const persistedScroll = usePersistedScroll(overviewScrollKey(projectId));

  // The spine selects via a click on a non-focusable prose block, so move DOM
  // focus to the scroll container — that is what lets ↑/↓ sort the fragment after
  // selecting it in the spine. preventScroll so selecting never jumps the view.
  const handleSpineSelectFragment = useCallback(
    (fragmentUuid: string) => {
      handleSelectFragment(fragmentUuid);
      scrollContainerRef.current?.focus({ preventScroll: true });
    },
    [handleSelectFragment],
  );

  // Persist sequence when it changes.
  useEffect(() => {
    if (activeSequenceId) writeOverviewSequence(projectId, activeSequenceId);
  }, [projectId, activeSequenceId]);

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
    // Reconcile the remembered scroll with the URL anchor: an external deep link
    // scrolls to its fragment; otherwise the remembered scroll position wins.
    const decision = resolveOverviewLoadScroll({
      activeAnchorId,
      authoredAnchor: readOverviewAuthoredAnchor(projectId),
      persistedOffset: persistedScroll.read(),
    });
    if (decision.kind === "anchor") {
      requestAnimationFrame(() => navigateToAnchor(decision.anchorId));
    } else if (decision.kind === "scroll") {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = decision.offset;
      });
    }
  }, [spineContentReady, persistedScroll, projectId, activeAnchorId, navigateToAnchor]);

  // Scroll the spine to the top of a fragment's anchor (used on overlay close to
  // return the reader to the last-shown fragment — ADR 0013). This is the direct
  // anchor scroll, distinct from the authored-anchor `scrollToFragment` above used
  // by left-column clicks.
  const scrollSpineToFragmentTop = useCallback((fragmentUuid: string) => {
    requestAnimationFrame(() => {
      document
        .getElementById(fragmentAnchorId(fragmentUuid))
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    });
  }, []);

  const {
    editingFragmentUuid,
    editorRef,
    previousUuid: previousEditUuid,
    nextUuid: nextEditUuid,
    openEditor,
    handleEdit,
    handleReorderSelect,
    closeEditor,
    saveEditor,
  } = useOverviewInlineEditor({
    editableOrder: overviewOrder,
    selectFragment: handleSelectFragment,
    sidebarSelectFragment: handleSidebarSelectFragment,
    spineContentReady,
    scrollToFragment: scrollSpineToFragmentTop,
  });

  const commands = useCommands();

  // Split fragment dialog (opened by overview:split-fragment — acts on the
  // currently selected spine fragment, not a picker).
  const [splitFragmentId, setSplitFragmentId] = useState<string | null>(null);
  const openSplit = useCallback(() => {
    if (primarySelectedUuid) setSplitFragmentId(primarySelectedUuid);
  }, [primarySelectedUuid]);

  const toggleArcOverlay = useCallback(() => setArcOverlayOpen((open) => !open), []);
  const toggleArcExpanded = useCallback(() => setArcExpanded((expanded) => !expanded), []);
  const toggleVerticalArcStrip = useCallback(() => setVerticalStripOpen((open) => !open), []);

  // Only the placed members of the selection participate in section operations.
  const placedSelection = useMemo(
    () => selection.filter((uuid) => fragmentSectionMap.has(uuid)),
    [selection, fragmentSectionMap],
  );

  const {
    canSplitBefore,
    canSplitAfter,
    groupSelection,
    splitBefore,
    splitAfter,
    moveSelectionToSection,
    sectionsForMove,
    mergeableUpSections,
    mergeableDownSections,
    mergeSectionUp,
    mergeSectionDown,
    unplaceFragment,
    placedFragmentsForUnplace,
  } = useSectionOps({
    projectId,
    sequence,
    sectionsData,
    placedSelection,
    allSequenceFragmentUuids,
    fragmentByUuid,
    mutations: sequenceMutations,
  });

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
    selectedFragmentId: primarySelectedUuid,
    openSplit,
  });

  // The overlay editor's Previous / Next / Close. goToFragment retargets the
  // overlay; closeEditor is supplied only while editing so the close command and
  // its mod+escape hotkey stay disabled otherwise.
  useCommandScope(fragmentNavScope, {
    hasNext: nextEditUuid !== null,
    hasPrevious: previousEditUuid !== null,
    nextUuid: nextEditUuid,
    previousUuid: previousEditUuid,
    save: saveEditor,
    goToFragment: openEditor,
    closeEditor: editingFragmentUuid ? closeEditor : undefined,
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
          onDragStart={sequenceReadOnly ? undefined : dnd.handleDragStart}
          onDragEnd={sequenceReadOnly ? undefined : dnd.handleDragEnd}
        >
          {/* The reorder column is itself a keyboard-sort surface: ↑/↓ sort the
              selected fragment when focus rests on one of its rows. It is a key
              listener, not a control, so the static-element a11y rule does not apply. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <aside
            data-testid="overview-sidebar"
            onKeyDown={handleMainKeyDown}
            className="w-64 shrink-0 border-r border-border overflow-y-auto p-3"
          >
            {sequenceReadOnly && (
              <p className="mb-3 rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Import-sequence — read-only. Clone it to rearrange.
              </p>
            )}
            <ReorderList
              sectionsData={sectionsData}
              poolFragmentUuids={poolFragmentUuids}
              colorByAspectKey={arcData.colorByAspectKey}
              fragmentByUuid={fragmentByUuid}
              selectedFragmentUuids={selectionSet}
              onSelectFragment={handleReorderSelect}
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
              readOnly={sequenceReadOnly}
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

      {/* Center-replacing editor overlay (ADR 0013). The host sidebars stay. The
          spine below stays mounted (hidden) while editing so closing is instant —
          re-instantiating its per-fragment editors on every close was the lag.
          Focus mode (if on) lifts this into a fixed full-viewport layer. */}
      {editingFragmentUuid && (
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <FragmentEditor
            key={editingFragmentUuid}
            ref={editorRef}
            projectId={projectId}
            fragmentId={editingFragmentUuid}
            sidebarCollapsible
            showMargin={false}
            navigation={{
              onPrevious: () => commands.run("fragments:previous"),
              onNext: () => commands.run("fragments:next"),
              hasPrevious: previousEditUuid !== null,
              hasNext: nextEditUuid !== null,
            }}
            backNode={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => commands.run("fragments:close-editor")}
              >
                ← Close
              </Button>
            }
            onSaved={handleEditorSaved}
          />
        </div>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 flex-col gap-6 p-4 overflow-y-auto ${
          editingFragmentUuid ? "hidden" : "flex"
        }`}
        data-testid="overview-main-content"
        // Programmatically focusable (not in the tab order): selecting a fragment
        // in the spine focuses this container so ↑/↓ route to the sort handler.
        tabIndex={-1}
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
              onDragStart={sequenceReadOnly ? undefined : dnd.handleDragStart}
              onDragEnd={sequenceReadOnly ? undefined : dnd.handleDragEnd}
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
                    sectionsData={sectionsData}
                    detailLevel={detailLevel}
                    fragmentByUuid={fragmentByUuid}
                    contentByFragmentUuid={contentByFragmentUuid}
                    selectedFragmentUuids={selectionSet}
                    onSelectFragment={handleSpineSelectFragment}
                    onRemoveFragment={sequenceReadOnly ? undefined : handleRemoveFragment}
                    onEdit={handleEdit}
                    readOnly={sequenceReadOnly}
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
        // Only offer "remove from sequence" when the selected fragment is placed
        // in the active sequence (the unplace target) and the sequence is writable
        // (import-sequences are read-only).
        onRemoveFragment={
          !sequenceReadOnly && primarySelectedUuid && fragmentSectionMap.has(primarySelectedUuid)
            ? handleRemoveFragment
            : undefined
        }
      />
      {splitFragmentId && (
        <SplitFragmentDialog
          projectId={projectId}
          fragmentId={splitFragmentId}
          open={splitFragmentId !== null}
          onOpenChange={(next) => {
            if (!next) setSplitFragmentId(null);
          }}
        />
      )}
    </div>
  );
};
