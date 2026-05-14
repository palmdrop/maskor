import type { FragmentPosition, Sequence } from "@maskor/shared";

function compactPositions(fragments: FragmentPosition[]): FragmentPosition[] {
  return [...fragments]
    .sort((a, b) => a.position - b.position)
    .map((fragment, index) => ({ ...fragment, position: index }));
}

export function validateSequenceInvariants(sequence: Sequence): void {
  const seen = new Set<string>();
  for (const section of sequence.sections) {
    const positions = section.fragments.map((f) => f.position);
    const sorted = [...positions].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i) {
        throw new Error(
          `Section "${section.name}" has non-dense positions. Expected ${i}, got ${sorted[i]}.`,
        );
      }
    }
    for (const fragmentPosition of section.fragments) {
      if (seen.has(fragmentPosition.fragmentUuid)) {
        throw new Error(
          `Fragment ${fragmentPosition.fragmentUuid} appears in multiple sections of sequence "${sequence.name}".`,
        );
      }
      seen.add(fragmentPosition.fragmentUuid);
    }
  }
}

export function createDefaultSequence(projectUuid: string, name: string): Sequence {
  return {
    uuid: crypto.randomUUID(),
    name,
    isMain: true,
    projectUuid,
    sections: [
      {
        uuid: crypto.randomUUID(),
        name: "Main",
        fragments: [],
      },
    ],
  };
}

export function placeFragment(
  sequence: Sequence,
  fragmentUuid: string,
  sectionUuid: string,
  position: number,
): Sequence {
  for (const section of sequence.sections) {
    if (section.fragments.some((f) => f.fragmentUuid === fragmentUuid)) {
      throw new Error(`Fragment ${fragmentUuid} is already placed in sequence "${sequence.name}".`);
    }
  }

  const targetSection = sequence.sections.find((s) => s.uuid === sectionUuid);
  if (!targetSection) {
    throw new Error(`Section ${sectionUuid} not found in sequence "${sequence.name}".`);
  }

  const clampedPosition = Math.min(position, targetSection.fragments.length);

  const shifted = targetSection.fragments.map((f) =>
    f.position >= clampedPosition ? { ...f, position: f.position + 1 } : f,
  );
  shifted.push({ uuid: crypto.randomUUID(), fragmentUuid, position: clampedPosition });

  const compacted = compactPositions(shifted);

  return {
    ...sequence,
    sections: sequence.sections.map((s) =>
      s.uuid === sectionUuid ? { ...s, fragments: compacted } : s,
    ),
  };
}

export function moveFragment(
  sequence: Sequence,
  fragmentUuid: string,
  targetSectionUuid: string,
  targetPosition: number,
): Sequence {
  let sourceSectionUuid: string | undefined;
  let existingPosition: FragmentPosition | undefined;

  for (const section of sequence.sections) {
    const match = section.fragments.find((f) => f.fragmentUuid === fragmentUuid);
    if (match) {
      sourceSectionUuid = section.uuid;
      existingPosition = match;
      break;
    }
  }

  if (!sourceSectionUuid || !existingPosition) {
    throw new Error(`Fragment ${fragmentUuid} is not placed in sequence "${sequence.name}".`);
  }

  const targetSection = sequence.sections.find((s) => s.uuid === targetSectionUuid);
  if (!targetSection) {
    throw new Error(`Section ${targetSectionUuid} not found in sequence "${sequence.name}".`);
  }

  const sourceSection = sequence.sections.find((s) => s.uuid === sourceSectionUuid)!;
  const afterRemoval = compactPositions(
    sourceSection.fragments.filter((f) => f.fragmentUuid !== fragmentUuid),
  );

  const baseTargetFragments =
    sourceSectionUuid === targetSectionUuid ? afterRemoval : targetSection.fragments;

  const clampedPosition = Math.min(targetPosition, baseTargetFragments.length);

  const shifted = baseTargetFragments.map((f) =>
    f.position >= clampedPosition ? { ...f, position: f.position + 1 } : f,
  );
  shifted.push({ ...existingPosition, position: clampedPosition });

  const compactedTarget = compactPositions(shifted);

  return {
    ...sequence,
    sections: sequence.sections.map((s) => {
      if (s.uuid === sourceSectionUuid && s.uuid === targetSectionUuid) {
        return { ...s, fragments: compactedTarget };
      }
      if (s.uuid === sourceSectionUuid) {
        return { ...s, fragments: afterRemoval };
      }
      if (s.uuid === targetSectionUuid) {
        return { ...s, fragments: compactedTarget };
      }
      return s;
    }),
  };
}

export function unplaceFragment(sequence: Sequence, fragmentUuid: string): Sequence {
  let found = false;

  const updatedSections = sequence.sections.map((section) => {
    if (!section.fragments.some((f) => f.fragmentUuid === fragmentUuid)) {
      return section;
    }
    found = true;
    const remaining = section.fragments.filter((f) => f.fragmentUuid !== fragmentUuid);
    return { ...section, fragments: compactPositions(remaining) };
  });

  if (!found) {
    throw new Error(`Fragment ${fragmentUuid} is not placed in sequence "${sequence.name}".`);
  }

  return { ...sequence, sections: updatedSections };
}

export function getUnassignedFragmentUuids(
  sequence: Sequence,
  allFragmentUuids: string[],
): string[] {
  const placed = new Set<string>();
  for (const section of sequence.sections) {
    for (const fragmentPosition of section.fragments) {
      placed.add(fragmentPosition.fragmentUuid);
    }
  }
  return allFragmentUuids.filter((uuid) => !placed.has(uuid));
}
