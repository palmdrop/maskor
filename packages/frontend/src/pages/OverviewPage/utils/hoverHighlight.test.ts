import { describe, it, expect } from "vitest";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { collectSequenceFragmentUuids, computeHoverHighlightUuids } from "./hoverHighlight";

const makeSequence = (uuid: string, sectionFragments: string[][]): Sequence =>
  ({
    uuid,
    name: uuid,
    isMain: false,
    active: true,
    projectUuid: "proj-1",
    filePath: `${uuid}.yaml`,
    contentHash: "hash",
    sections: sectionFragments.map((fragmentUuids, sectionIndex) => ({
      uuid: `${uuid}-sec-${sectionIndex.toString()}`,
      name: `Section ${sectionIndex.toString()}`,
      fragments: fragmentUuids.map((fragmentUuid, index) => ({
        uuid: `pos-${fragmentUuid}`,
        fragmentUuid,
        position: index,
      })),
    })),
  }) as Sequence;

describe("collectSequenceFragmentUuids", () => {
  it("flattens fragments across sections in order", () => {
    const sequence = makeSequence("s1", [["a", "b"], ["c"]]);
    expect(collectSequenceFragmentUuids(sequence)).toEqual(["a", "b", "c"]);
  });
});

describe("computeHoverHighlightUuids", () => {
  const active = makeSequence("active", [["a", "b", "c"]]);
  const secondary = makeSequence("secondary", [["b", "c", "z"]]);
  const sequences = [active, secondary];

  it("returns the hovered sequence's fragment uuids", () => {
    const result = computeHoverHighlightUuids("secondary", "active", sequences);
    expect([...result].sort()).toEqual(["b", "c", "z"]);
  });

  it("returns an empty set when nothing is hovered", () => {
    expect(computeHoverHighlightUuids(null, "active", sequences).size).toBe(0);
  });

  it("returns an empty set when the hovered sequence is the active one", () => {
    expect(computeHoverHighlightUuids("active", "active", sequences).size).toBe(0);
  });

  it("returns an empty set when the hovered sequence is unknown", () => {
    expect(computeHoverHighlightUuids("ghost", "active", sequences).size).toBe(0);
  });

  it("highlights against the main sequence when no explicit active id is resolved", () => {
    // activeSequenceUuid is passed as the resolved active (main) uuid; a
    // secondary still highlights, the active/main itself does not.
    expect(computeHoverHighlightUuids("secondary", "active", sequences).size).toBe(3);
  });
});
