import { arrayMove } from "@dnd-kit/sortable";
import type { Sequence } from "@api/generated/maskorAPI.schemas";

export function optimisticPlace(
  sequence: Sequence,
  fragmentUuid: string,
  sectionUuid: string,
  position: number,
): Sequence {
  return {
    ...sequence,
    sections: sequence.sections.map((section) => {
      if (section.uuid !== sectionUuid) return section;
      const sorted = [...section.fragments].sort((a, b) => a.position - b.position);
      sorted.splice(position, 0, { uuid: crypto.randomUUID(), fragmentUuid, position });
      const recompacted = sorted.map((fragment, index) => ({ ...fragment, position: index }));
      return { ...section, fragments: recompacted };
    }),
  };
}

export function optimisticMove(
  sequence: Sequence,
  fragmentUuid: string,
  targetSectionUuid: string,
  newPosition: number,
): Sequence {
  const sourceSectionIndex = sequence.sections.findIndex((s) =>
    s.fragments.some((f) => f.fragmentUuid === fragmentUuid),
  );
  if (sourceSectionIndex === -1) return sequence;
  const sourceSection = sequence.sections[sourceSectionIndex]!;

  if (sourceSection.uuid === targetSectionUuid) {
    const sorted = [...sourceSection.fragments].sort((a, b) => a.position - b.position);
    const oldIndex = sorted.findIndex((f) => f.fragmentUuid === fragmentUuid);
    if (oldIndex === -1) return sequence;
    const reordered = arrayMove(sorted, oldIndex, newPosition);
    const recompacted = reordered.map((fragment, index) => ({ ...fragment, position: index }));
    return {
      ...sequence,
      sections: sequence.sections.map((s) =>
        s.uuid === targetSectionUuid ? { ...s, fragments: recompacted } : s,
      ),
    };
  }

  const fragmentToMove = sourceSection.fragments.find((f) => f.fragmentUuid === fragmentUuid);
  if (!fragmentToMove) return sequence;

  return {
    ...sequence,
    sections: sequence.sections.map((section) => {
      if (section.uuid === sourceSection.uuid) {
        return {
          ...section,
          fragments: section.fragments
            .filter((f) => f.fragmentUuid !== fragmentUuid)
            .map((f, index) => ({ ...f, position: index })),
        };
      }
      if (section.uuid === targetSectionUuid) {
        const sorted = [...section.fragments].sort((a, b) => a.position - b.position);
        sorted.splice(newPosition, 0, { ...fragmentToMove, position: newPosition });
        return { ...section, fragments: sorted.map((f, index) => ({ ...f, position: index })) };
      }
      return section;
    }),
  };
}

export function optimisticUnplace(sequence: Sequence, fragmentUuid: string): Sequence {
  return {
    ...sequence,
    sections: sequence.sections.map((section) => ({
      ...section,
      fragments: section.fragments
        .filter((f) => f.fragmentUuid !== fragmentUuid)
        .sort((a, b) => a.position - b.position)
        .map((f, index) => ({ ...f, position: index })),
    })),
  };
}
