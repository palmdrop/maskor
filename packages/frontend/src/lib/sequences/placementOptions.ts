import type { Sequence } from "@api/generated/maskorAPI.schemas";

export interface PlacementOption {
  uuid: string;
  name: string;
  // The section the active fragment already sits in within this sequence, or
  // null when the fragment is not yet placed here.
  sectionName: string | null;
}

// Build the "Place in sequence…" picker options for a given fragment: sequences
// the fragment is already placed in float to the top (so the user can move it),
// each annotated with its current section; the rest keep their order. Within
// each group the relative order of the input is preserved (stable sort).
export const buildPlacementOptions = (
  sequences: Sequence[],
  fragmentUuid: string | undefined,
): PlacementOption[] => {
  const options = sequences.map((sequence): PlacementOption => {
    const section = fragmentUuid
      ? sequence.sections.find((candidate) =>
          candidate.fragments.some((position) => position.fragmentUuid === fragmentUuid),
        )
      : undefined;
    return {
      uuid: sequence.uuid,
      name: sequence.name,
      sectionName: section ? section.name : null,
    };
  });

  // Stable partition: members first, non-members after, each preserving order.
  const members = options.filter((option) => option.sectionName !== null);
  const others = options.filter((option) => option.sectionName === null);
  return [...members, ...others];
};

// Picker label: member sequences carry an "already in «section»" suffix so the
// user knows selecting one lets them move the fragment, not just add it.
export const placementOptionLabel = (option: PlacementOption): string =>
  option.sectionName !== null
    ? `${option.name} — already in «${option.sectionName || "Untitled section"}»`
    : option.name;
