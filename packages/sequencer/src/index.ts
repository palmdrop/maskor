import type { FragmentPosition, Sequence } from "@maskor/shared";

const compactPositions = (fragments: FragmentPosition[]): FragmentPosition[] =>
  [...fragments]
    .sort((a, b) => a.position - b.position)
    .map((fragment, index) => ({ ...fragment, position: index }));

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
