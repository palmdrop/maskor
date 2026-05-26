import { useState, useCallback } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import type { useSequenceMutations } from "@lib/sequences/useSequenceMutations";
import { POOL_ZONE_ID } from "../constants";

interface UseSequenceDnDParams {
  sequence: Sequence | undefined;
  projectId: string;
  sectionsData: Array<{ uuid: string; fragmentUuids: string[] }>;
  poolFragmentUuids: string[];
  fragmentSectionMap: Map<string, string>;
  mutations: ReturnType<typeof useSequenceMutations>;
}

export const useSequenceDnD = ({
  sequence,
  projectId,
  sectionsData,
  poolFragmentUuids,
  fragmentSectionMap,
  mutations,
}: UseSequenceDnDParams) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  }, []);

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

    const targetSectionUuid = sectionIds.has(overId)
      ? overId
      : (fragmentSectionMap.get(overId) ?? sectionsData[0]?.uuid ?? "");

    if (!isActiveInSequence && isOverInSequence) {
      const targetSection = sectionsData.find((s) => s.uuid === targetSectionUuid);
      const position = sectionIds.has(overId)
        ? (targetSection?.fragmentUuids.length ?? 0)
        : (targetSection?.fragmentUuids.indexOf(overId) ?? 0);
      mutations.placeFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        data: { fragmentUuid: activeId, sectionUuid: targetSectionUuid, position },
      });
    } else if (isActiveInSequence && isOverInSequence && activeId !== overId) {
      const targetSection = sectionsData.find((s) => s.uuid === targetSectionUuid);
      if (!targetSection) return;

      if (sectionIds.has(overId)) {
        const position = targetSection.fragmentUuids.length;
        mutations.moveFragment.mutate({
          projectId,
          sequenceId: sequence.uuid,
          fragmentUuid: activeId,
          data: { sectionUuid: targetSectionUuid, position },
        });
      } else {
        const targetFragmentUuids = targetSection.fragmentUuids;
        const targetIndex = targetFragmentUuids.indexOf(overId);
        if (targetIndex !== -1) {
          mutations.moveFragment.mutate({
            projectId,
            sequenceId: sequence.uuid,
            fragmentUuid: activeId,
            data: { sectionUuid: targetSectionUuid, position: targetIndex },
          });
        }
      }
    } else if (isActiveInSequence && (isOverInPool || (!isOverInSequence && !isOverInPool))) {
      mutations.unplaceFragment.mutate({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid: activeId,
      });
    }
  };

  return { activeDragId, sensors, collisionDetection, handleDragStart, handleDragEnd };
};
