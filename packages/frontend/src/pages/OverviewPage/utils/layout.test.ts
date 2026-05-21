import { describe, it, expect } from "vitest";
import {
  computeSequenceLayout,
  TILE_DIMENSIONS_BY_DENSITY,
  TILE_GAP,
  SECTION_GAP,
  SECTION_PADDING,
  SECTION_BORDER,
  EMPTY_SECTION_WIDTH,
} from "./layout";

const fullTile = TILE_DIMENSIONS_BY_DENSITY.full.tileWidth;
const sectionBoxOverhead = 2 * SECTION_PADDING + 2 * SECTION_BORDER;

describe("computeSequenceLayout", () => {
  it("returns zero width and empty maps for no sections", () => {
    const layout = computeSequenceLayout([], "full");
    expect(layout.totalWidth).toBe(0);
    expect(layout.sections).toEqual([]);
    expect(layout.centerByFragmentUuid.size).toBe(0);
  });

  it("centers a single fragment in a single section at the expected x", () => {
    const layout = computeSequenceLayout([{ uuid: "sec-1", fragmentUuids: ["f1"] }], "full");
    const expectedCenter = SECTION_BORDER + SECTION_PADDING + fullTile / 2;
    expect(layout.centerByFragmentUuid.get("f1")).toBe(expectedCenter);
  });

  it("places successive fragments TILE_GAP apart within a section", () => {
    const layout = computeSequenceLayout([{ uuid: "sec-1", fragmentUuids: ["f1", "f2"] }], "full");
    const centerA = layout.centerByFragmentUuid.get("f1")!;
    const centerB = layout.centerByFragmentUuid.get("f2")!;
    expect(centerB - centerA).toBe(fullTile + TILE_GAP);
  });

  it("offsets the second section by SECTION_GAP plus the first section's width", () => {
    const layout = computeSequenceLayout(
      [
        { uuid: "sec-1", fragmentUuids: ["f1"] },
        { uuid: "sec-2", fragmentUuids: ["f2"] },
      ],
      "full",
    );
    const section1Width = sectionBoxOverhead + fullTile;
    expect(layout.sections[0]?.width).toBe(section1Width);
    expect(layout.sections[1]?.startX).toBe(section1Width + SECTION_GAP);
    const centerB = layout.centerByFragmentUuid.get("f2")!;
    expect(centerB).toBe(
      section1Width + SECTION_GAP + SECTION_BORDER + SECTION_PADDING + fullTile / 2,
    );
  });

  it("uses EMPTY_SECTION_WIDTH content for an empty section", () => {
    const layout = computeSequenceLayout([{ uuid: "sec-1", fragmentUuids: [] }], "full");
    expect(layout.sections[0]?.width).toBe(EMPTY_SECTION_WIDTH + sectionBoxOverhead);
  });

  it("totalWidth equals the sum of section widths plus section gaps", () => {
    const layout = computeSequenceLayout(
      [
        { uuid: "sec-1", fragmentUuids: ["f1", "f2"] },
        { uuid: "sec-2", fragmentUuids: ["f3"] },
      ],
      "full",
    );
    const section1 = sectionBoxOverhead + 2 * fullTile + TILE_GAP;
    const section2 = sectionBoxOverhead + fullTile;
    expect(layout.totalWidth).toBe(section1 + SECTION_GAP + section2);
  });
});
