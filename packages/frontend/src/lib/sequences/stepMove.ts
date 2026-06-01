export interface SectionFragments {
  uuid: string;
  fragmentUuids: string[];
}

export interface StepMoveTarget {
  sectionUuid: string;
  position: number;
}

// Given the ordered sections of a sequence and a placed fragment, compute the
// target section + position for moving that fragment one step in `direction`,
// crossing section boundaries (end of section N -> start of section N+1).
// Returns null when the fragment is not placed or is already at the relevant
// end of the sequence. Shared by the Overview (arrow-key rearrange) and the
// place-in-sequence modal so the two surfaces cannot drift on move semantics.
//
// Coordinate system: the returned `position` is the destination index *after*
// the moved fragment has been removed from its current slot (remove-then-insert
// semantics) — this is the contract the move endpoint expects, which is why a
// within-section "next" step lands at `currentIndex + 1` rather than `+ 2`.
// This differs from placing a brand-new fragment, where `position` is a plain
// insertion index into the unchanged section (see PlaceInSequenceModal.handleAdd).
export const computeStepMoveTarget = (
  sectionsData: SectionFragments[],
  fragmentUuid: string,
  direction: "prev" | "next",
): StepMoveTarget | null => {
  const currentSectionIndex = sectionsData.findIndex((section) =>
    section.fragmentUuids.includes(fragmentUuid),
  );
  if (currentSectionIndex === -1) return null;

  const currentSection = sectionsData[currentSectionIndex]!;
  const currentPositionInSection = currentSection.fragmentUuids.indexOf(fragmentUuid);

  let targetSectionIndex: number;
  let targetPosition: number;

  if (direction === "prev") {
    if (currentPositionInSection > 0) {
      targetSectionIndex = currentSectionIndex;
      targetPosition = currentPositionInSection - 1;
    } else if (currentSectionIndex > 0) {
      targetSectionIndex = currentSectionIndex - 1;
      targetPosition = sectionsData[targetSectionIndex]!.fragmentUuids.length;
    } else {
      return null;
    }
  } else {
    if (currentPositionInSection < currentSection.fragmentUuids.length - 1) {
      targetSectionIndex = currentSectionIndex;
      targetPosition = currentPositionInSection + 1;
    } else if (currentSectionIndex < sectionsData.length - 1) {
      targetSectionIndex = currentSectionIndex + 1;
      targetPosition = 0;
    } else {
      return null;
    }
  }

  return { sectionUuid: sectionsData[targetSectionIndex]!.uuid, position: targetPosition };
};
