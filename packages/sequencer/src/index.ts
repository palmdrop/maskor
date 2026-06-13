import type { FragmentPosition, Sequence } from "@maskor/shared";

const compactPositions = (fragments: FragmentPosition[]): FragmentPosition[] =>
  [...fragments]
    .sort((a, b) => a.position - b.position)
    .map((fragment, index) => ({ ...fragment, position: index }));

// Thrown when a mutating operation targets a read-only sequence. Carried across
// the API boundary and translated to a 409 by the route error mapper.
export class SequenceReadOnlyError extends Error {
  constructor(public readonly sequenceName: string) {
    super(`Sequence "${sequenceName}" is read-only and cannot be modified.`);
    this.name = "SequenceReadOnlyError";
  }
}

// An import-sequence — a sequence carrying an `origin` — is a frozen snapshot of
// its original import order. Its placements and section structure cannot change;
// to build on it the user clones it first. The rule lives here in the sequencer
// so it holds for every caller, not just the UI.
export function isSequenceReadOnly(sequence: Sequence): boolean {
  return sequence.origin !== undefined;
}

export function assertSequenceMutable(sequence: Sequence): void {
  if (isSequenceReadOnly(sequence)) {
    throw new SequenceReadOnlyError(sequence.name);
  }
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
    active: true,
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
  assertSequenceMutable(sequence);
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
  assertSequenceMutable(sequence);
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
  assertSequenceMutable(sequence);
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

export function getFragmentOrder(sequence: Sequence): string[] {
  const result: string[] = [];
  for (const section of sequence.sections) {
    const sorted = [...section.fragments].sort((a, b) => a.position - b.position);
    for (const fragmentPosition of sorted) {
      result.push(fragmentPosition.fragmentUuid);
    }
  }
  return result;
}

export type Violation = {
  fragmentUuid: string;
  predecessorUuid: string;
  secondaryUuid: string;
};

export type Cycle = {
  sequenceUuids: string[];
  fragmentUuids: string[];
};

type ConstraintGraph = {
  adjacency: Map<string, Map<string, Set<string>>>;
  allNodes: Set<string>;
};

const buildConstraintGraph = (secondaries: Sequence[]): ConstraintGraph => {
  const adjacency = new Map<string, Map<string, Set<string>>>();
  const allNodes = new Set<string>();

  for (const secondary of secondaries) {
    const order = getFragmentOrder(secondary);
    for (let i = 0; i < order.length; i++) {
      allNodes.add(order[i]!);
      for (let j = i + 1; j < order.length; j++) {
        const from = order[i]!;
        const to = order[j]!;
        let neighbors = adjacency.get(from);
        if (!neighbors) {
          neighbors = new Map();
          adjacency.set(from, neighbors);
        }
        let edgeSecondaries = neighbors.get(to);
        if (!edgeSecondaries) {
          edgeSecondaries = new Set();
          neighbors.set(to, edgeSecondaries);
        }
        edgeSecondaries.add(secondary.uuid);
      }
    }
  }

  return { adjacency, allNodes };
};

const findStronglyConnectedComponents = (graph: ConstraintGraph): string[][] => {
  const { adjacency, allNodes } = graph;
  const indexMap = new Map<string, number>();
  const lowMap = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let nextIndex = 0;

  const strongconnect = (node: string): void => {
    indexMap.set(node, nextIndex);
    lowMap.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    const neighbors = adjacency.get(node);
    if (neighbors) {
      for (const neighbor of neighbors.keys()) {
        if (!indexMap.has(neighbor)) {
          strongconnect(neighbor);
          lowMap.set(node, Math.min(lowMap.get(node)!, lowMap.get(neighbor)!));
        } else if (onStack.has(neighbor)) {
          lowMap.set(node, Math.min(lowMap.get(node)!, indexMap.get(neighbor)!));
        }
      }
    }

    if (lowMap.get(node) === indexMap.get(node)) {
      const scc: string[] = [];
      let popped: string;
      do {
        popped = stack.pop()!;
        onStack.delete(popped);
        scc.push(popped);
      } while (popped !== node);
      sccs.push(scc);
    }
  };

  for (const node of allNodes) {
    if (!indexMap.has(node)) {
      strongconnect(node);
    }
  }

  return sccs;
};

export function detectCycles(secondaries: Sequence[]): Cycle[] {
  const graph = buildConstraintGraph(secondaries);
  const sccs = findStronglyConnectedComponents(graph);
  const cycles: Cycle[] = [];

  for (const scc of sccs) {
    if (scc.length <= 1) continue;
    const sccSet = new Set(scc);
    const contributingSecondaries = new Set<string>();
    for (const from of scc) {
      const neighbors = graph.adjacency.get(from);
      if (!neighbors) continue;
      for (const [to, edgeSecondaries] of neighbors.entries()) {
        if (!sccSet.has(to)) continue;
        for (const secondaryUuid of edgeSecondaries) {
          contributingSecondaries.add(secondaryUuid);
        }
      }
    }
    cycles.push({
      sequenceUuids: [...contributingSecondaries],
      fragmentUuids: scc,
    });
  }

  return cycles;
}

const findCyclicSecondaryUuids = (secondaries: Sequence[]): Set<string> => {
  const cyclicSecondaryUuids = new Set<string>();
  for (const cycle of detectCycles(secondaries)) {
    for (const sequenceUuid of cycle.sequenceUuids) {
      cyclicSecondaryUuids.add(sequenceUuid);
    }
  }
  return cyclicSecondaryUuids;
};

export function computeViolations(main: Sequence, secondaries: Sequence[]): Violation[] {
  const mainOrder = getFragmentOrder(main);
  const mainPosition = new Map<string, number>();
  for (let i = 0; i < mainOrder.length; i++) {
    mainPosition.set(mainOrder[i]!, i);
  }

  const cyclicSecondaryUuids = findCyclicSecondaryUuids(secondaries);
  const violations: Violation[] = [];

  for (const secondary of secondaries) {
    if (cyclicSecondaryUuids.has(secondary.uuid)) continue;
    const order = getFragmentOrder(secondary);
    for (let i = 0; i < order.length; i++) {
      const predecessorUuid = order[i]!;
      const predecessorMainPosition = mainPosition.get(predecessorUuid);
      if (predecessorMainPosition === undefined) continue;
      for (let j = i + 1; j < order.length; j++) {
        const fragmentUuid = order[j]!;
        const fragmentMainPosition = mainPosition.get(fragmentUuid);
        if (fragmentMainPosition === undefined) continue;
        if (predecessorMainPosition >= fragmentMainPosition) {
          violations.push({
            fragmentUuid,
            predecessorUuid,
            secondaryUuid: secondary.uuid,
          });
        }
      }
    }
  }

  return violations;
}

export function moveSection(sequence: Sequence, sectionUuid: string, newIndex: number): Sequence {
  assertSequenceMutable(sequence);
  const currentIndex = sequence.sections.findIndex((s) => s.uuid === sectionUuid);
  if (currentIndex === -1) {
    throw new Error(`Section ${sectionUuid} not found in sequence "${sequence.name}".`);
  }
  const clamped = Math.max(0, Math.min(newIndex, sequence.sections.length - 1));
  if (currentIndex === clamped) return sequence;
  const sections = [...sequence.sections];
  const [section] = sections.splice(currentIndex, 1);
  sections.splice(clamped, 0, section!);
  return { ...sequence, sections };
}

// Group an arbitrary set of already-placed fragments into a brand-new section.
// The fragments are removed from their current sections (preserving the relative
// order in which they appear across the whole sequence) and gathered into a new
// section inserted where the selection begins — at the index of the section that
// currently holds the earliest-ordered selected fragment. Sections emptied by
// the move are kept (deletion is a separate operation).
export function groupFragmentsIntoSection(
  sequence: Sequence,
  fragmentUuids: string[],
  newSectionName: string,
): Sequence {
  assertSequenceMutable(sequence);
  if (fragmentUuids.length === 0) {
    throw new Error("Cannot group an empty selection into a section.");
  }
  const selected = new Set(fragmentUuids);
  if (selected.size !== fragmentUuids.length) {
    throw new Error("Cannot group a selection containing duplicate fragments.");
  }

  const order = getFragmentOrder(sequence);
  const placed = new Set(order);
  for (const fragmentUuid of fragmentUuids) {
    if (!placed.has(fragmentUuid)) {
      throw new Error(`Fragment ${fragmentUuid} is not placed in sequence "${sequence.name}".`);
    }
  }

  const selectedInOrder = order.filter((fragmentUuid) => selected.has(fragmentUuid));

  // Home section = the section holding the earliest selected fragment. Place the
  // new section before or after it based on the selection's centre of mass
  // within that section: a selection in the top half lands before the (remaining)
  // home section, one in the bottom half lands after. (Pulling a block out
  // collapses the leftovers into one contiguous section, so before/after is the
  // only meaningful choice.)
  const firstSelected = selectedInOrder[0]!;
  const homeIndex = sequence.sections.findIndex((section) =>
    section.fragments.some((f) => f.fragmentUuid === firstSelected),
  );
  const homeSorted = [...sequence.sections[homeIndex]!.fragments].sort(
    (a, b) => a.position - b.position,
  );
  const selectedPositionsInHome = homeSorted
    .map((fragment, index) => ({ fragmentUuid: fragment.fragmentUuid, index }))
    .filter((entry) => selected.has(entry.fragmentUuid))
    .map((entry) => entry.index);
  const meanPosition =
    selectedPositionsInHome.reduce((sum, position) => sum + position, 0) /
    selectedPositionsInHome.length;
  const homeMidpoint = (homeSorted.length - 1) / 2;
  const insertIndex = meanPosition <= homeMidpoint ? homeIndex : homeIndex + 1;

  const strippedSections = sequence.sections.map((section) => ({
    ...section,
    fragments: compactPositions(section.fragments.filter((f) => !selected.has(f.fragmentUuid))),
  }));

  const newSection = {
    uuid: crypto.randomUUID(),
    name: newSectionName,
    fragments: selectedInOrder.map((fragmentUuid, index) => ({
      uuid: crypto.randomUUID(),
      fragmentUuid,
      position: index,
    })),
  };

  const sections = [...strippedSections];
  sections.splice(insertIndex, 0, newSection);

  return { ...sequence, sections };
}

// Move a set of already-placed fragments into an existing section as a single
// contiguous block at `targetPosition`, preserving their relative sequence
// order. Equivalent to dragging many fragments into a section at once.
export function moveFragmentsToSection(
  sequence: Sequence,
  fragmentUuids: string[],
  targetSectionUuid: string,
  targetPosition: number,
): Sequence {
  assertSequenceMutable(sequence);
  if (fragmentUuids.length === 0) {
    throw new Error("Cannot move an empty selection.");
  }
  const selected = new Set(fragmentUuids);
  if (selected.size !== fragmentUuids.length) {
    throw new Error("Cannot move a selection containing duplicate fragments.");
  }

  const targetSection = sequence.sections.find((s) => s.uuid === targetSectionUuid);
  if (!targetSection) {
    throw new Error(`Section ${targetSectionUuid} not found in sequence "${sequence.name}".`);
  }

  const order = getFragmentOrder(sequence);
  const placed = new Set(order);
  for (const fragmentUuid of fragmentUuids) {
    if (!placed.has(fragmentUuid)) {
      throw new Error(`Fragment ${fragmentUuid} is not placed in sequence "${sequence.name}".`);
    }
  }

  const selectedInOrder = order.filter((fragmentUuid) => selected.has(fragmentUuid));

  // Preserve each moved fragment's existing position record (and its uuid).
  const positionByFragment = new Map<string, FragmentPosition>();
  for (const section of sequence.sections) {
    for (const fragmentPosition of section.fragments) {
      if (selected.has(fragmentPosition.fragmentUuid)) {
        positionByFragment.set(fragmentPosition.fragmentUuid, fragmentPosition);
      }
    }
  }

  const strippedSections = sequence.sections.map((section) => ({
    ...section,
    fragments: compactPositions(section.fragments.filter((f) => !selected.has(f.fragmentUuid))),
  }));

  const strippedTarget = strippedSections.find((s) => s.uuid === targetSectionUuid)!;
  const clampedPosition = Math.min(Math.max(0, targetPosition), strippedTarget.fragments.length);
  const blockSize = selectedInOrder.length;

  const shifted = strippedTarget.fragments.map((f) =>
    f.position >= clampedPosition ? { ...f, position: f.position + blockSize } : f,
  );
  const insertedBlock = selectedInOrder.map((fragmentUuid, index) => ({
    ...positionByFragment.get(fragmentUuid)!,
    position: clampedPosition + index,
  }));
  const compactedTarget = compactPositions([...shifted, ...insertedBlock]);

  return {
    ...sequence,
    sections: strippedSections.map((s) =>
      s.uuid === targetSectionUuid ? { ...s, fragments: compactedTarget } : s,
    ),
  };
}

// Split a section at a marked fragment: the marked fragment and everything after
// it (by position) move into a new section inserted immediately after the
// original, which keeps the fragments before the split point. Splitting at the
// first fragment of a section is rejected — the boundary already exists there
// and splitting would only create an empty section.
export function splitSectionAtFragment(
  sequence: Sequence,
  fragmentUuid: string,
  newSectionName: string,
): Sequence {
  assertSequenceMutable(sequence);
  const sectionIndex = sequence.sections.findIndex((section) =>
    section.fragments.some((f) => f.fragmentUuid === fragmentUuid),
  );
  if (sectionIndex === -1) {
    throw new Error(`Fragment ${fragmentUuid} is not placed in sequence "${sequence.name}".`);
  }

  const sourceSection = sequence.sections[sectionIndex]!;
  const sorted = [...sourceSection.fragments].sort((a, b) => a.position - b.position);
  const splitAt = sorted.findIndex((f) => f.fragmentUuid === fragmentUuid);
  if (splitAt === 0) {
    throw new Error(
      `Fragment ${fragmentUuid} already starts its section; there is nothing to split.`,
    );
  }

  const before = compactPositions(sorted.slice(0, splitAt));
  const after = compactPositions(sorted.slice(splitAt));

  const newSection = {
    uuid: crypto.randomUUID(),
    name: newSectionName,
    fragments: after,
  };

  const sections = [...sequence.sections];
  sections[sectionIndex] = { ...sourceSection, fragments: before };
  sections.splice(sectionIndex + 1, 0, newSection);

  return { ...sequence, sections };
}

// Merge a section into the one immediately below it: the lower section's
// fragments are appended to this section (preserving order) and the lower
// section's boundary is removed. The upper section survives (keeps its uuid,
// name, and slot). This is the inverse of a split, and the primitive behind
// "merge up" / "merge down" (merge up = merge the previous section with this
// one). Throws if the section is the last one (nothing below to merge).
export function mergeSectionWithNext(sequence: Sequence, sectionUuid: string): Sequence {
  assertSequenceMutable(sequence);
  const index = sequence.sections.findIndex((s) => s.uuid === sectionUuid);
  if (index === -1) {
    throw new Error(`Section ${sectionUuid} not found in sequence "${sequence.name}".`);
  }
  if (index === sequence.sections.length - 1) {
    throw new Error(`Section ${sectionUuid} has no following section to merge with.`);
  }

  const upper = sequence.sections[index]!;
  const lower = sequence.sections[index + 1]!;
  const upperSorted = [...upper.fragments].sort((a, b) => a.position - b.position);
  const lowerSorted = [...lower.fragments].sort((a, b) => a.position - b.position);
  // Renumber by concatenation order — both sections number positions from 0, so
  // compacting (which sorts by position) would interleave them.
  const merged = [...upperSorted, ...lowerSorted].map((fragment, position) => ({
    ...fragment,
    position,
  }));

  const sections = sequence.sections
    .filter((_, sectionIndex) => sectionIndex !== index + 1)
    .map((section) => (section.uuid === sectionUuid ? { ...section, fragments: merged } : section));

  return { ...sequence, sections };
}

// Clone a sequence into a fresh, independent copy. Every identity is
// regenerated — the sequence uuid, every section uuid, and every fragment
// position uuid — so the clone shares no record identity with its source (no
// UUID collisions). Placements are preserved verbatim: the same fragments sit
// in the same sections at the same positions. The clone is never main (a
// project has exactly one main sequence) and is active by default; the caller
// supplies the new name. `origin` (import provenance) is intentionally NOT
// carried over — a clone is authored in-app, not imported from a source file,
// so inheriting it would mislabel the clone as imported. Only the domain
// `Sequence` fields are carried over, so passing a storage-indexed sequence
// drops its file-level metadata.
export function cloneSequence(sequence: Sequence, newName: string): Sequence {
  return {
    uuid: crypto.randomUUID(),
    name: newName,
    isMain: false,
    active: sequence.active,
    projectUuid: sequence.projectUuid,
    sections: sequence.sections.map((section) => ({
      uuid: crypto.randomUUID(),
      name: section.name,
      fragments: [...section.fragments]
        .sort((a, b) => a.position - b.position)
        .map((fragment, index) => ({
          uuid: crypto.randomUUID(),
          fragmentUuid: fragment.fragmentUuid,
          position: index,
        })),
    })),
  };
}

// Insert the whole `source` sequence into `target` as a block of sections,
// spliced into `target`'s section list at `sectionIndex` (clamped to
// [0, target.sections.length]). The inserted sections get fresh uuids and
// fresh fragment-position uuids so they never collide with target's records.
// A fragment can only be placed once per sequence, so any source fragment
// already placed anywhere in target is skipped (dropped from the inserted
// block); target's existing placement wins. Inserted sections emptied by this
// de-duplication are still inserted (deletion is a separate operation, matching
// group/split). The source sequence is left untouched.
export function insertSequenceIntoSequence(
  target: Sequence,
  source: Sequence,
  sectionIndex: number,
): Sequence {
  // Guard the target only: the source is read, never mutated, so inserting an
  // import-sequence into a writable target is allowed.
  assertSequenceMutable(target);
  const alreadyPlaced = new Set<string>();
  for (const section of target.sections) {
    for (const fragmentPosition of section.fragments) {
      alreadyPlaced.add(fragmentPosition.fragmentUuid);
    }
  }

  const insertedSections = source.sections.map((section) => ({
    uuid: crypto.randomUUID(),
    name: section.name,
    fragments: compactPositions(
      section.fragments.filter((fragment) => !alreadyPlaced.has(fragment.fragmentUuid)),
    ).map((fragment) => ({ ...fragment, uuid: crypto.randomUUID() })),
  }));

  const clampedIndex = Math.max(0, Math.min(sectionIndex, target.sections.length));
  const sections = [...target.sections];
  sections.splice(clampedIndex, 0, ...insertedSections);

  return { ...target, sections };
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
