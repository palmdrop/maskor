import { describe, it, expect } from "vitest";
import { computeStepMoveTarget, type SectionFragments } from "../stepMove";

const sections: SectionFragments[] = [
  { uuid: "s1", fragmentUuids: ["a", "b", "c"] },
  { uuid: "s2", fragmentUuids: ["d", "e"] },
];

describe("computeStepMoveTarget", () => {
  it("moves a fragment back one position within its section", () => {
    expect(computeStepMoveTarget(sections, "b", "prev")).toEqual({ sectionUuid: "s1", position: 0 });
  });

  it("moves a fragment forward one position within its section", () => {
    expect(computeStepMoveTarget(sections, "b", "next")).toEqual({ sectionUuid: "s1", position: 2 });
  });

  it("crosses to the end of the previous section when at the start of a section", () => {
    expect(computeStepMoveTarget(sections, "d", "prev")).toEqual({ sectionUuid: "s1", position: 3 });
  });

  it("crosses to the start of the next section when at the end of a section", () => {
    expect(computeStepMoveTarget(sections, "c", "next")).toEqual({ sectionUuid: "s2", position: 0 });
  });

  it("returns null at the very start of the sequence", () => {
    expect(computeStepMoveTarget(sections, "a", "prev")).toBeNull();
  });

  it("returns null at the very end of the sequence", () => {
    expect(computeStepMoveTarget(sections, "e", "next")).toBeNull();
  });

  it("returns null when the fragment is not placed in any section", () => {
    expect(computeStepMoveTarget(sections, "z", "next")).toBeNull();
  });
});
