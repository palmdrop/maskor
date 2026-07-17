// Arc x-axis layout for the vertical Overview.
//
// The legacy horizontal Overview mapped arc points onto tile centers computed
// by `computeSequenceLayout`. The redesigned arc overlay has no tiles: the
// x-axis is derived purely from a fragment's index in the flattened sequence
// order and fit to the available width. Fragments are spaced evenly with a half
// step of horizontal padding on each edge so the first and last points are not
// flush against the panel border.

// Horizontal pixels allotted to each fragment when a sequence graph overlay is
// expanded into its zoomable/scrollable form. Compressed mode fits to the
// container instead. Shared by the arc and length overlays.
export const EXPANDED_PX_PER_FRAGMENT = 64;

export interface ArcSectionBoundary {
  uuid: string;
  name: string;
  startX: number;
  endX: number;
}

export interface ArcXLayout {
  orderedFragmentUuids: string[];
  centerByFragmentUuid: Map<string, number>;
  sectionBoundaries: ArcSectionBoundary[];
  totalCount: number;
}

// Map each placed fragment to an x-coordinate spread evenly across `width`.
// Sections are returned with their pixel spans so a minimized sections bar can
// render boundaries aligned to the same x-axis.
export const computeArcXLayout = (
  sectionsData: Array<{ uuid: string; name: string; fragmentUuids: string[] }>,
  width: number,
): ArcXLayout => {
  const orderedFragmentUuids = sectionsData.flatMap((section) => section.fragmentUuids);
  const totalCount = orderedFragmentUuids.length;
  const centerByFragmentUuid = new Map<string, number>();

  // Step between adjacent points; the edges get a half-step of padding so a
  // single fragment lands in the middle rather than at x=0.
  const step = totalCount > 0 ? width / totalCount : 0;
  orderedFragmentUuids.forEach((fragmentUuid, index) => {
    centerByFragmentUuid.set(fragmentUuid, step * (index + 0.5));
  });

  const sectionBoundaries: ArcSectionBoundary[] = [];
  let cursorIndex = 0;
  for (const section of sectionsData) {
    const count = section.fragmentUuids.length;
    const startX = step * cursorIndex;
    const endX = step * (cursorIndex + count);
    sectionBoundaries.push({ uuid: section.uuid, name: section.name, startX, endX });
    cursorIndex += count;
  }

  return { orderedFragmentUuids, centerByFragmentUuid, sectionBoundaries, totalCount };
};
