import { describe, it, expect } from "vitest";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { buildPlacementOptions, placementOptionLabel } from "./placementOptions";

const sequence = (
  uuid: string,
  name: string,
  sections: { uuid: string; name: string; fragmentUuids: string[] }[],
): Sequence => ({
  uuid,
  name,
  isMain: false,
  active: true,
  projectUuid: "project-1",
  filePath: `${uuid}.yaml`,
  contentHash: "hash",
  sections: sections.map((section) => ({
    uuid: section.uuid,
    name: section.name,
    fragments: section.fragmentUuids.map((fragmentUuid, index) => ({
      uuid: `pos-${section.uuid}-${index}`,
      fragmentUuid,
      position: index,
    })),
  })),
});

describe("buildPlacementOptions", () => {
  it("floats sequences the fragment is already in to the top, annotated with the section", () => {
    const sequences = [
      sequence("s-a", "Alpha", [{ uuid: "sec-a", name: "Opening", fragmentUuids: ["other"] }]),
      sequence("s-b", "Beta", [{ uuid: "sec-b", name: "Act II", fragmentUuids: ["frag-1"] }]),
      sequence("s-c", "Gamma", [{ uuid: "sec-c", name: "End", fragmentUuids: [] }]),
    ];

    const options = buildPlacementOptions(sequences, "frag-1");

    expect(options.map((option) => option.uuid)).toEqual(["s-b", "s-a", "s-c"]);
    expect(options[0]).toEqual({ uuid: "s-b", name: "Beta", sectionName: "Act II" });
    expect(options[1]!.sectionName).toBeNull();
  });

  it("returns all non-members (in order) when the fragment is placed nowhere", () => {
    const sequences = [
      sequence("s-a", "Alpha", [{ uuid: "sec-a", name: "Opening", fragmentUuids: [] }]),
      sequence("s-b", "Beta", [{ uuid: "sec-b", name: "Act II", fragmentUuids: ["x"] }]),
    ];

    const options = buildPlacementOptions(sequences, "frag-1");

    expect(options.map((option) => option.uuid)).toEqual(["s-a", "s-b"]);
    expect(options.every((option) => option.sectionName === null)).toBe(true);
  });

  it("treats an undefined fragment as a member of nothing", () => {
    const sequences = [
      sequence("s-a", "Alpha", [{ uuid: "sec-a", name: "Opening", fragmentUuids: ["frag-1"] }]),
    ];
    expect(buildPlacementOptions(sequences, undefined)[0]!.sectionName).toBeNull();
  });
});

describe("placementOptionLabel", () => {
  it("suffixes member options with the section, plain name otherwise", () => {
    expect(placementOptionLabel({ uuid: "s", name: "Beta", sectionName: "Act II" })).toBe(
      "Beta — already in «Act II»",
    );
    expect(placementOptionLabel({ uuid: "s", name: "Beta", sectionName: null })).toBe("Beta");
    expect(placementOptionLabel({ uuid: "s", name: "Beta", sectionName: "" })).toBe(
      "Beta — already in «Untitled section»",
    );
  });
});
