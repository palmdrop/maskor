import type { OverviewDensity } from "../../../router";

export type TileDimensions = {
  tileWidth: number;
  tileHeight: number;
  tileClass: string;
};

// Source of truth for per-density tile sizes. TileContent uses tileClass for
// Tailwind layout; ArcPanel uses tileWidth (in px) to compute curve x-coordinates
// so arc points land on tile centers without DOM measurement.
export const TILE_DIMENSIONS_BY_DENSITY: Record<OverviewDensity, TileDimensions> = {
  full: { tileWidth: 160, tileHeight: 112, tileClass: "h-28 w-40 p-3" },
  compact: { tileWidth: 128, tileHeight: 56, tileClass: "h-14 w-32 p-2" },
  mini: { tileWidth: 80, tileHeight: 24, tileClass: "h-6 w-20 p-0" },
};

// Layout constants matching the SectionZone wrapper and tile/section gaps.
// Kept in one place so the arc layer and the rendered DOM stay in sync.
export const TILE_GAP = 12; // gap-3 between tiles inside a section
export const SECTION_GAP = 12; // gap-3 between sibling section blocks
export const SECTION_PADDING = 16; // p-4 inside SectionZone
export const SECTION_BORDER = 2; // border-2 on SectionZone
export const EMPTY_SECTION_WIDTH = 240; // visual placeholder width when a section has no tiles

export type SectionLayoutEntry = {
  uuid: string;
  fragmentUuids: string[];
  width: number;
  startX: number;
};

// Compute the horizontal extent of each section and the centers of every placed
// fragment. Returns sections in input order plus an aggregate totalWidth that
// equals the natural width of the section row (so ArcPanel can render an SVG
// whose width exactly matches).
export const computeSequenceLayout = (
  sectionsData: Array<{ uuid: string; fragmentUuids: string[] }>,
  density: OverviewDensity,
): {
  sections: SectionLayoutEntry[];
  centerByFragmentUuid: Map<string, number>;
  totalWidth: number;
} => {
  const { tileWidth } = TILE_DIMENSIONS_BY_DENSITY[density];
  const centerByFragmentUuid = new Map<string, number>();
  const sections: SectionLayoutEntry[] = [];

  let cursorX = 0;
  for (let sectionIndex = 0; sectionIndex < sectionsData.length; sectionIndex++) {
    const section = sectionsData[sectionIndex]!;
    const count = section.fragmentUuids.length;
    const sectionContentWidth =
      count === 0 ? EMPTY_SECTION_WIDTH : count * tileWidth + Math.max(0, count - 1) * TILE_GAP;
    const sectionWidth = sectionContentWidth + 2 * SECTION_PADDING + 2 * SECTION_BORDER;

    const innerStartX = cursorX + SECTION_BORDER + SECTION_PADDING;
    for (let fragmentIndex = 0; fragmentIndex < count; fragmentIndex++) {
      const fragmentUuid = section.fragmentUuids[fragmentIndex]!;
      const tileLeft = innerStartX + fragmentIndex * (tileWidth + TILE_GAP);
      centerByFragmentUuid.set(fragmentUuid, tileLeft + tileWidth / 2);
    }

    sections.push({
      uuid: section.uuid,
      fragmentUuids: section.fragmentUuids,
      width: sectionWidth,
      startX: cursorX,
    });

    cursorX += sectionWidth;
    if (sectionIndex < sectionsData.length - 1) cursorX += SECTION_GAP;
  }

  return { sections, centerByFragmentUuid, totalWidth: cursorX };
};
