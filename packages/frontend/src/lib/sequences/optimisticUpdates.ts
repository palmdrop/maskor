import { arrayMove } from "@dnd-kit/sortable";
import type { Sequence } from "@api/generated/maskorAPI.schemas";

export function optimisticMoveSection(
  sequence: Sequence,
  sectionUuid: string,
  newIndex: number,
): Sequence {
  const currentIndex = sequence.sections.findIndex((s) => s.uuid === sectionUuid);
  if (currentIndex === -1) return sequence;
  const sections = [...sequence.sections];
  const [section] = sections.splice(currentIndex, 1);
  sections.splice(Math.max(0, Math.min(newIndex, sections.length)), 0, section!);
  return { ...sequence, sections };
}

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

type SectionFragments = Sequence["sections"][number]["fragments"];

const compact = (fragments: SectionFragments): SectionFragments =>
  [...fragments]
    .sort((a, b) => a.position - b.position)
    .map((f, index) => ({ ...f, position: index }));

const flattenedOrder = (sequence: Sequence): string[] =>
  sequence.sections.flatMap((section) =>
    [...section.fragments].sort((a, b) => a.position - b.position).map((f) => f.fragmentUuid),
  );

// Optimistic mirror of `groupFragmentsIntoSection` from @maskor/sequencer.
export function optimisticGroup(
  sequence: Sequence,
  fragmentUuids: string[],
  sectionName: string,
): Sequence {
  const selected = new Set(fragmentUuids);
  const selectedInOrder = flattenedOrder(sequence).filter((uuid) => selected.has(uuid));
  if (selectedInOrder.length === 0) return sequence;

  const firstSelected = selectedInOrder[0]!;
  const insertIndex = sequence.sections.findIndex((section) =>
    section.fragments.some((f) => f.fragmentUuid === firstSelected),
  );

  const stripped = sequence.sections.map((section) => ({
    ...section,
    fragments: compact(section.fragments.filter((f) => !selected.has(f.fragmentUuid))),
  }));

  const newSection = {
    uuid: crypto.randomUUID(),
    name: sectionName,
    fragments: selectedInOrder.map((fragmentUuid, index) => ({
      uuid: crypto.randomUUID(),
      fragmentUuid,
      position: index,
    })),
  };

  const sections = [...stripped];
  sections.splice(insertIndex < 0 ? stripped.length : insertIndex, 0, newSection);
  return { ...sequence, sections };
}

// Optimistic mirror of `moveFragmentsToSection` from @maskor/sequencer.
export function optimisticMoveMany(
  sequence: Sequence,
  fragmentUuids: string[],
  targetSectionUuid: string,
  position: number,
): Sequence {
  const selected = new Set(fragmentUuids);
  const selectedInOrder = flattenedOrder(sequence).filter((uuid) => selected.has(uuid));
  if (selectedInOrder.length === 0) return sequence;
  if (!sequence.sections.some((s) => s.uuid === targetSectionUuid)) return sequence;

  const positionByFragment = new Map<string, SectionFragments[number]>();
  for (const section of sequence.sections) {
    for (const fragmentPosition of section.fragments) {
      if (selected.has(fragmentPosition.fragmentUuid)) {
        positionByFragment.set(fragmentPosition.fragmentUuid, fragmentPosition);
      }
    }
  }

  const stripped = sequence.sections.map((section) => ({
    ...section,
    fragments: compact(section.fragments.filter((f) => !selected.has(f.fragmentUuid))),
  }));

  const strippedTarget = stripped.find((s) => s.uuid === targetSectionUuid)!;
  const clampedPosition = Math.min(Math.max(0, position), strippedTarget.fragments.length);
  const blockSize = selectedInOrder.length;

  const shifted = strippedTarget.fragments.map((f) =>
    f.position >= clampedPosition ? { ...f, position: f.position + blockSize } : f,
  );
  const insertedBlock = selectedInOrder.map((fragmentUuid, index) => ({
    ...positionByFragment.get(fragmentUuid)!,
    position: clampedPosition + index,
  }));
  const compactedTarget = compact([...shifted, ...insertedBlock]);

  return {
    ...sequence,
    sections: stripped.map((s) =>
      s.uuid === targetSectionUuid ? { ...s, fragments: compactedTarget } : s,
    ),
  };
}

// Optimistic mirror of `splitSectionAtFragment` from @maskor/sequencer.
export function optimisticSplit(
  sequence: Sequence,
  fragmentUuid: string,
  sectionName: string,
): Sequence {
  const sectionIndex = sequence.sections.findIndex((section) =>
    section.fragments.some((f) => f.fragmentUuid === fragmentUuid),
  );
  if (sectionIndex === -1) return sequence;

  const sourceSection = sequence.sections[sectionIndex]!;
  const sorted = [...sourceSection.fragments].sort((a, b) => a.position - b.position);
  const splitAt = sorted.findIndex((f) => f.fragmentUuid === fragmentUuid);
  if (splitAt <= 0) return sequence;

  const before = compact(sorted.slice(0, splitAt));
  const after = compact(sorted.slice(splitAt));
  const newSection = { uuid: crypto.randomUUID(), name: sectionName, fragments: after };

  const sections = [...sequence.sections];
  sections[sectionIndex] = { ...sourceSection, fragments: before };
  sections.splice(sectionIndex + 1, 0, newSection);
  return { ...sequence, sections };
}

// Optimistic mirror of `mergeSectionWithNext` from @maskor/sequencer.
export function optimisticMergeWithNext(sequence: Sequence, sectionUuid: string): Sequence {
  const index = sequence.sections.findIndex((s) => s.uuid === sectionUuid);
  if (index === -1 || index === sequence.sections.length - 1) return sequence;

  const upper = sequence.sections[index]!;
  const lower = sequence.sections[index + 1]!;
  const upperSorted = [...upper.fragments].sort((a, b) => a.position - b.position);
  const lowerSorted = [...lower.fragments].sort((a, b) => a.position - b.position);
  const merged = [...upperSorted, ...lowerSorted].map((fragment, position) => ({
    ...fragment,
    position,
  }));

  const sections = sequence.sections
    .filter((_, sectionIndex) => sectionIndex !== index + 1)
    .map((section) => (section.uuid === sectionUuid ? { ...section, fragments: merged } : section));

  return { ...sequence, sections };
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
