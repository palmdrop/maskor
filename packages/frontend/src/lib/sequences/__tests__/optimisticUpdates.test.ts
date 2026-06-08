import { describe, it, expect } from "vitest";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { optimisticGroup } from "../optimisticUpdates";

const FA = "aaaaaaaa-0000-0000-0000-000000000001";
const FB = "bbbbbbbb-0000-0000-0000-000000000001";
const FC = "cccccccc-0000-0000-0000-000000000001";
const FD = "dddddddd-0000-0000-0000-000000000001";

const fragment = (fragmentUuid: string, position: number) => ({
  uuid: `pos-${fragmentUuid}`,
  fragmentUuid,
  position,
});

const makeSequence = (
  sections: Array<{ uuid: string; name: string; fragmentUuids: string[] }>,
): Sequence => ({
  uuid: "seq-1",
  name: "Test",
  isMain: true,
  active: true,
  projectUuid: "project-1",
  filePath: "sequences/main.md",
  contentHash: "hash",
  sections: sections.map((section) => ({
    uuid: section.uuid,
    name: section.name,
    fragments: section.fragmentUuids.map((fragmentUuid, index) => fragment(fragmentUuid, index)),
  })),
});

const sectionOrder = (sequence: Sequence) =>
  sequence.sections.map((section) => ({
    name: section.name,
    fragmentUuids: [...section.fragments]
      .sort((a, b) => a.position - b.position)
      .map((f) => f.fragmentUuid),
  }));

// Regression: the optimistic mirror must match groupFragmentsIntoSection's
// centre-of-mass placement (top-half selection → before its home section,
// bottom-half → after), otherwise the new section jumps when the server result
// is refetched.
describe("optimisticGroup placement", () => {
  it("places the new section BEFORE the home section for a top-half selection", () => {
    const sequence = makeSequence([{ uuid: "s1", name: "Main", fragmentUuids: [FA, FB, FC, FD] }]);

    const grouped = optimisticGroup(sequence, [FA, FB], "Group");

    expect(sectionOrder(grouped)).toEqual([
      { name: "Group", fragmentUuids: [FA, FB] },
      { name: "Main", fragmentUuids: [FC, FD] },
    ]);
  });

  it("places the new section AFTER the home section for a bottom-half selection", () => {
    const sequence = makeSequence([{ uuid: "s1", name: "Main", fragmentUuids: [FA, FB, FC, FD] }]);

    const grouped = optimisticGroup(sequence, [FC, FD], "Group");

    expect(sectionOrder(grouped)).toEqual([
      { name: "Main", fragmentUuids: [FA, FB] },
      { name: "Group", fragmentUuids: [FC, FD] },
    ]);
  });

  it("uses the section holding the earliest selected fragment as the home section", () => {
    const sequence = makeSequence([
      { uuid: "s1", name: "First", fragmentUuids: [FA, FB] },
      { uuid: "s2", name: "Second", fragmentUuids: [FC, FD] },
    ]);

    // FC sits at the top of "Second", so the group lands before "Second".
    const grouped = optimisticGroup(sequence, [FC], "Group");

    expect(sectionOrder(grouped)).toEqual([
      { name: "First", fragmentUuids: [FA, FB] },
      { name: "Group", fragmentUuids: [FC] },
      { name: "Second", fragmentUuids: [FD] },
    ]);
  });

  it("keeps the selected fragments in sequence order within the new section", () => {
    const sequence = makeSequence([
      { uuid: "s1", name: "First", fragmentUuids: [FA, FB] },
      { uuid: "s2", name: "Second", fragmentUuids: [FC, FD] },
    ]);

    const grouped = optimisticGroup(sequence, [FD, FA], "Group");
    const groupSection = grouped.sections.find((section) => section.name === "Group");

    expect(groupSection?.fragments.map((f) => f.fragmentUuid)).toEqual([FA, FD]);
  });
});
