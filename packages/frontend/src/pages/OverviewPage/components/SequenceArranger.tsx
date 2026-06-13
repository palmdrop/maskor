import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import type { FragmentSummary, Sequence } from "@api/generated/maskorAPI.schemas";
import { getListSequencesQueryKey } from "@api/generated/sequences/sequences";
import { useSequenceMutations } from "@lib/sequences/useSequenceMutations";
import { computeStepMoveTarget } from "@lib/sequences/stepMove";
import { isTextEntryTarget } from "@lib/keyboard";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { Button } from "@components/ui/button";
import { ReorderList } from "./ReorderList";
import type { SectionData } from "./reorder-types";
import { useSequenceDnD } from "../hooks/useSequenceDnD";

interface SequenceArrangerProps {
  projectId: string;
  sequence: Sequence;
  // All project fragment summaries — used to render rows and derive the pool of
  // non-discarded fragments not yet placed in this sequence.
  allFragments: FragmentSummary[];
  // The fragment the arranger is opened for: emphasized, scrolled into view, and
  // the target of the quick add/move/remove footer actions.
  activeFragmentUuid: string;
}

// The arranger reuses the Overview's tile presentation with neutral aspect bars
// rather than recomputing the per-aspect palette.
const NO_ASPECT_COLORS = new Map<string, string>();
const NO_TOOLTIPS = (): string[] => [];
const NOOP = () => {};

// An active-fragment-centric drag-and-drop arranger scoped to a single sequence.
// Reuses the Overview's left-column look (ReorderList + useSequenceDnD) but hides
// section management — it only arranges the active fragment across existing
// sections and the pool, with the pool beside the sections. Drag, keyboard
// (↑/↓, plus j/k in vim mode, and Backspace), and the footer buttons all commit
// against the same place/move/unplace endpoints as the Overview.
export const SequenceArranger = ({
  projectId,
  sequence,
  allFragments,
  activeFragmentUuid,
}: SequenceArrangerProps) => {
  const listQueryKey = getListSequencesQueryKey(projectId);
  const mutations = useSequenceMutations(listQueryKey);
  const { vimMode } = useProjectEditorConfig(projectId);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set when a keyboard move/remove fires so the effect below restores focus to
  // the active row after it re-renders (a cross-section move unmounts the old
  // row, dropping DOM focus and breaking subsequent keystrokes).
  const refocusActiveRowRef = useRef(false);

  const fragmentByUuid = useMemo(
    () => new Map(allFragments.map((fragment) => [fragment.uuid, fragment])),
    [allFragments],
  );

  const sectionsData: SectionData[] = useMemo(
    () =>
      sequence.sections.map((section) => ({
        uuid: section.uuid,
        name: section.name,
        fragmentUuids: [...section.fragments]
          .sort((a, b) => a.position - b.position)
          .map((fragment) => fragment.fragmentUuid),
      })),
    [sequence],
  );

  const fragmentSectionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sectionsData) {
      for (const fragmentUuid of section.fragmentUuids) map.set(fragmentUuid, section.uuid);
    }
    return map;
  }, [sectionsData]);

  const poolFragmentUuids = useMemo(
    () =>
      allFragments
        .filter((fragment) => !fragment.isDiscarded && !fragmentSectionMap.has(fragment.uuid))
        .map((fragment) => fragment.uuid),
    [allFragments, fragmentSectionMap],
  );

  // The arranger is opened for a single fragment: the highlight tracks that
  // fragment and is not user-selectable, so it always matches what the footer
  // buttons and ←/→/Backspace act on.
  const selectionSet = useMemo(() => new Set([activeFragmentUuid]), [activeFragmentUuid]);

  const dnd = useSequenceDnD({
    sequence,
    projectId,
    sectionsData,
    poolFragmentUuids,
    fragmentSectionMap,
    mutations,
  });

  // Scroll the active fragment into view once the list is mounted.
  useEffect(() => {
    const node = containerRef.current?.querySelector(
      `[data-fragment-uuid="${activeFragmentUuid}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
    // Only on open / when the active fragment changes — not on every reorder.
  }, [activeFragmentUuid]);

  // After a keyboard move/remove re-renders the list, restore focus (and view) to
  // the active row so the next keystroke still reaches the container handler.
  useEffect(() => {
    if (!refocusActiveRowRef.current) return;
    refocusActiveRowRef.current = false;

    const node = containerRef.current?.querySelector<HTMLElement>(
      `[data-fragment-uuid="${activeFragmentUuid}"]`,
    );
    node?.focus();
    node?.scrollIntoView({ block: "nearest" });
  }, [sectionsData, activeFragmentUuid]);

  const currentSectionUuid = fragmentSectionMap.get(activeFragmentUuid) ?? null;
  const isPlaced = currentSectionUuid !== null;

  const moveTargets = useMemo(
    () => ({
      prev: computeStepMoveTarget(sectionsData, activeFragmentUuid, "prev"),
      next: computeStepMoveTarget(sectionsData, activeFragmentUuid, "next"),
    }),
    [sectionsData, activeFragmentUuid],
  );

  const handleAdd = () => {
    const targetSection = sectionsData[0];
    if (!targetSection) return;
    // Place uses a plain insertion index (append at the section's current end).
    mutations.placeFragment.mutate({
      projectId,
      sequenceId: sequence.uuid,
      data: {
        fragmentUuid: activeFragmentUuid,
        sectionUuid: targetSection.uuid,
        position: targetSection.fragmentUuids.length,
      },
    });
  };

  const handleMove = (direction: "prev" | "next") => {
    const target = moveTargets[direction];
    if (!target) return;
    mutations.moveFragment.mutate({
      projectId,
      sequenceId: sequence.uuid,
      fragmentUuid: activeFragmentUuid,
      data: { sectionUuid: target.sectionUuid, position: target.position },
    });
  };

  const handleRemove = (fragmentUuid: string) => {
    mutations.unplaceFragment.mutate({ projectId, sequenceId: sequence.uuid, fragmentUuid });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryTarget(event.target as HTMLElement)) return;
    if (!isPlaced) return;

    // The list is vertical, so up/down sort the fragment; j/k mirror them in vim
    // mode. Each move/remove flags a refocus so keyboard control survives the
    // cross-section re-render.
    const movesUp = event.key === "ArrowUp" || (vimMode && event.key === "k");
    const movesDown = event.key === "ArrowDown" || (vimMode && event.key === "j");

    if (movesUp) {
      event.preventDefault();
      refocusActiveRowRef.current = true;
      handleMove("prev");
    } else if (movesDown) {
      event.preventDefault();
      refocusActiveRowRef.current = true;
      handleMove("next");
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      refocusActiveRowRef.current = true;
      handleRemove(activeFragmentUuid);
    }
  };

  const activeDragFragment = dnd.activeDragId ? fragmentByUuid.get(dnd.activeDragId) : undefined;

  return (
    // The container catches the ↑/↓ (j/k) / Backspace shortcuts that bubble up
    // from the focused row inside it; it is a keyboard listener, not itself a
    // control, so the static-element a11y rule does not apply.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={containerRef} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={dnd.collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      >
        <ReorderList
          sectionsData={sectionsData}
          poolFragmentUuids={poolFragmentUuids}
          colorByAspectKey={NO_ASPECT_COLORS}
          fragmentByUuid={fragmentByUuid}
          selectedFragmentUuids={selectionSet}
          onSelectFragment={NOOP}
          onRemoveFragment={handleRemove}
          getViolationTooltips={NO_TOOLTIPS}
          getCycleTooltips={NO_TOOLTIPS}
          editingSectionId={null}
          setEditingSectionId={NOOP}
          editingSectionValue=""
          setEditingSectionValue={NOOP}
          confirmingDeleteSectionId={null}
          setConfirmingDeleteSectionId={NOOP}
          handleSectionRenameCommit={NOOP}
          handleSectionRenameKeyDown={NOOP}
          onDeleteSection={NOOP}
          onMergeUp={NOOP}
          onMergeDown={NOOP}
          hasSequence
          createSectionPending={false}
          onAddSection={NOOP}
          showSectionControls={false}
          layout="split"
        />
        {/*
          Portal the drag overlay to the body: the modal centers its content with
          a CSS transform, which makes `position: fixed` (the overlay) resolve
          against the dialog instead of the viewport — the cursor and the dragged
          tile drift apart without this. React context still flows through the
          portal, so the overlay stays inside the DndContext.
        */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeDragFragment ? (
              <div className="rounded border border-primary bg-card px-2 py-1 text-xs font-medium shadow">
                {activeDragFragment.key}
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        {isPlaced ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={!moveTargets.prev}
              onClick={() => handleMove("prev")}
            >
              Move up
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!moveTargets.next}
              onClick={() => handleMove("next")}
            >
              Move down
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => handleRemove(activeFragmentUuid)}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={mutations.placeFragment.isPending || sectionsData.length === 0}
            onClick={handleAdd}
          >
            Add to sequence
          </Button>
        )}
      </div>
    </div>
  );
};
