import type { Sequence } from "@api/generated/maskorAPI.schemas";

// Every fragment uuid placed in a sequence, flattened across its sections.
export const collectSequenceFragmentUuids = (sequence: Sequence): string[] =>
  sequence.sections.flatMap((section) =>
    section.fragments.map((position) => position.fragmentUuid),
  );

// The set of fragments to highlight when a sequence row is hovered in the
// sidebar: the hovered sequence's members. The active-sequence surfaces only
// render their own fragments, so intersecting with the active sequence happens
// implicitly downstream — a highlighted uuid that isn't placed in the active
// sequence simply has nothing to mark.
//
// Returns an empty set when nothing is hovered or when the hovered sequence is
// the active one (highlighting the active sequence against itself is noise).
export const computeHoverHighlightUuids = (
  hoveredSequenceId: string | null,
  activeSequenceUuid: string | undefined,
  sequences: readonly Sequence[],
): Set<string> => {
  if (hoveredSequenceId === null) return new Set();
  if (hoveredSequenceId === activeSequenceUuid) return new Set();
  const hovered = sequences.find((sequence) => sequence.uuid === hoveredSequenceId);
  if (!hovered) return new Set();
  return new Set(collectSequenceFragmentUuids(hovered));
};
