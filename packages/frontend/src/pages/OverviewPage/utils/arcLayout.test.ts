import { describe, it, expect } from "vitest";
import { computeArcXLayout } from "./arcLayout";

const section = (uuid: string, fragmentUuids: string[], name = uuid) => ({
  uuid,
  name,
  fragmentUuids,
});

describe("computeArcXLayout", () => {
  it("returns empty layout for no sections", () => {
    const layout = computeArcXLayout([], 1000);
    expect(layout.orderedFragmentUuids).toEqual([]);
    expect(layout.centerByFragmentUuid.size).toBe(0);
    expect(layout.sectionBoundaries).toEqual([]);
    expect(layout.totalCount).toBe(0);
  });

  it("centers a single fragment at half the width", () => {
    const layout = computeArcXLayout([section("s1", ["a"])], 1000);
    expect(layout.centerByFragmentUuid.get("a")).toBe(500);
  });

  it("spaces fragments evenly across the width by sequence index", () => {
    const layout = computeArcXLayout([section("s1", ["a", "b", "c", "d"])], 800);
    // step = 800 / 4 = 200; centers at 100, 300, 500, 700.
    expect(layout.centerByFragmentUuid.get("a")).toBe(100);
    expect(layout.centerByFragmentUuid.get("b")).toBe(300);
    expect(layout.centerByFragmentUuid.get("c")).toBe(500);
    expect(layout.centerByFragmentUuid.get("d")).toBe(700);
  });

  it("uses the flattened cross-section order for the x-axis", () => {
    const layout = computeArcXLayout([section("s1", ["a", "b"]), section("s2", ["c", "d"])], 800);
    expect(layout.orderedFragmentUuids).toEqual(["a", "b", "c", "d"]);
    // c is the 3rd fragment overall (index 2), not restarted per section.
    expect(layout.centerByFragmentUuid.get("c")).toBe(500);
  });

  it("reports section boundaries spanning the same x-axis as the curves", () => {
    const layout = computeArcXLayout([section("s1", ["a", "b"]), section("s2", ["c"])], 900);
    // step = 900 / 3 = 300.
    expect(layout.sectionBoundaries).toEqual([
      { uuid: "s1", name: "s1", startX: 0, endX: 600 },
      { uuid: "s2", name: "s2", startX: 600, endX: 900 },
    ]);
  });

  it("scales x-coordinates with width (fit-to-width / expanded zoom)", () => {
    const narrow = computeArcXLayout([section("s1", ["a", "b"])], 400);
    const wide = computeArcXLayout([section("s1", ["a", "b"])], 800);
    expect(narrow.centerByFragmentUuid.get("a")).toBe(100);
    expect(wide.centerByFragmentUuid.get("a")).toBe(200);
  });
});
