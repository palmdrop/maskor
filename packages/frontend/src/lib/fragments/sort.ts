import type { Sequence } from "@api/generated/maskorAPI.schemas";

// Fragment-list sort modes. "name", "createdAt", and "updatedAt" are intrinsic
// to the index row; "sequence" orders by a chosen sequence's placement (unplaced
// fragments fall to the bottom). Encoded as a string for the <Select> value +
// persistence:
//   "name" | "createdAt" | "updatedAt" | "sequence:<uuid>"
export type FragmentSortMode =
  | { kind: "name" }
  | { kind: "createdAt" }
  | { kind: "updatedAt" }
  | { kind: "sequence"; sequenceUuid: string };

const SEQUENCE_PREFIX = "sequence:";

export const encodeSortMode = (mode: FragmentSortMode): string =>
  mode.kind === "sequence" ? `${SEQUENCE_PREFIX}${mode.sequenceUuid}` : mode.kind;

export const parseSortMode = (value: string): FragmentSortMode => {
  if (value === "createdAt") return { kind: "createdAt" };
  if (value === "updatedAt") return { kind: "updatedAt" };
  if (value.startsWith(SEQUENCE_PREFIX)) {
    return { kind: "sequence", sequenceUuid: value.slice(SEQUENCE_PREFIX.length) };
  }
  return { kind: "name" };
};

// Flatten a sequence into a fragmentUuid → ordinal map: sections in array order,
// fragments within a section by ascending position. The ordinal is a single
// running index across the whole sequence so it sorts the flat list directly.
export const buildSequenceOrder = (sequence: Sequence): Map<string, number> => {
  const order = new Map<string, number>();
  let index = 0;
  for (const section of sequence.sections) {
    const placed = [...section.fragments].sort((a, b) => a.position - b.position);
    for (const fragment of placed) {
      if (!order.has(fragment.fragmentUuid)) order.set(fragment.fragmentUuid, index++);
    }
  }
  return order;
};

type SortableFragment = { uuid: string; key: string; createdAt: string; updatedAt: string };

const byKey = (a: SortableFragment, b: SortableFragment) => a.key.localeCompare(b.key);

// Sort a copy of `fragments` by the given mode. For "sequence", `order` maps the
// chosen sequence's placed fragments to ordinals; placed fragments come first in
// sequence order, unplaced fragments follow sorted by key.
export const sortFragments = <T extends SortableFragment>(
  fragments: T[],
  mode: FragmentSortMode,
  order?: Map<string, number>,
): T[] => {
  const copy = [...fragments];
  if (mode.kind === "name") {
    return copy.sort(byKey);
  }
  if (mode.kind === "createdAt") {
    // ISO-8601 strings sort lexically; most recently created first.
    return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (mode.kind === "updatedAt") {
    // ISO-8601 strings sort lexically; most recently updated first.
    return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const sequenceOrder = order ?? new Map<string, number>();
  return copy.sort((a, b) => {
    const aIndex = sequenceOrder.get(a.uuid);
    const bIndex = sequenceOrder.get(b.uuid);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return byKey(a, b);
  });
};
