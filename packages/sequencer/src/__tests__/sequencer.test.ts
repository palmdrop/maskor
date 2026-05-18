import { describe, it, expect } from "bun:test";
import type { Sequence } from "@maskor/shared";
import {
  computeViolations,
  createDefaultSequence,
  detectCycles,
  placeFragment,
  moveFragment,
  unplaceFragment,
  getUnassignedFragmentUuids,
  validateSequenceInvariants,
  getFragmentOrder,
} from "../index";

const PROJECT_UUID = "00000000-0000-0000-0000-000000000001";

function makeSequence(): Sequence {
  return createDefaultSequence(PROJECT_UUID, "Test Sequence");
}

function mainSectionUuid(sequence: Sequence): string {
  return sequence.sections[0]!.uuid;
}

function fragmentUuids(sequence: Sequence, sectionIndex = 0): string[] {
  return sequence.sections[sectionIndex]!.fragments.sort((a, b) => a.position - b.position).map(
    (f) => f.fragmentUuid,
  );
}

const FA = "aaaaaaaa-0000-0000-0000-000000000001";
const FB = "bbbbbbbb-0000-0000-0000-000000000001";
const FC = "cccccccc-0000-0000-0000-000000000001";
const FD = "dddddddd-0000-0000-0000-000000000001";

describe("createDefaultSequence", () => {
  it("returns a sequence with isMain=true", () => {
    const sequence = makeSequence();
    expect(sequence.isMain).toBe(true);
  });

  it("has one section named Main with no fragments", () => {
    const sequence = makeSequence();
    expect(sequence.sections).toHaveLength(1);
    expect(sequence.sections[0]!.name).toBe("Main");
    expect(sequence.sections[0]!.fragments).toHaveLength(0);
  });

  it("assigns the provided projectUuid", () => {
    const sequence = makeSequence();
    expect(sequence.projectUuid).toBe(PROJECT_UUID);
  });
});

describe("placeFragment", () => {
  it("inserts at head (position 0)", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 0);
    expect(fragmentUuids(sequence)).toEqual([FB, FA]);
  });

  it("inserts at tail", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    expect(fragmentUuids(sequence)).toEqual([FA, FB]);
  });

  it("inserts in the middle and shifts", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = placeFragment(sequence, FC, sectionUuid, 1);
    expect(fragmentUuids(sequence)).toEqual([FA, FC, FB]);
  });

  it("clamps out-of-range position to tail", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 999);
    expect(fragmentUuids(sequence)).toEqual([FA, FB]);
  });

  it("positions are always dense and 0-based after placement", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 0);
    sequence = placeFragment(sequence, FC, sectionUuid, 1);
    validateSequenceInvariants(sequence);
  });

  it("throws when fragment is already placed", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    expect(() => placeFragment(sequence, FA, sectionUuid, 1)).toThrow();
  });

  it("throws when section is not found", () => {
    const sequence = makeSequence();
    expect(() => placeFragment(sequence, FA, "00000000-0000-0000-0000-000000000000", 0)).toThrow();
  });
});

describe("moveFragment", () => {
  it("moves backward within a section", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = placeFragment(sequence, FC, sectionUuid, 2);
    // Move C (position 2) to position 0
    sequence = moveFragment(sequence, FC, sectionUuid, 0);
    expect(fragmentUuids(sequence)).toEqual([FC, FA, FB]);
  });

  it("moves forward within a section", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = placeFragment(sequence, FC, sectionUuid, 2);
    // Move A (position 0) to position 2
    sequence = moveFragment(sequence, FA, sectionUuid, 2);
    expect(fragmentUuids(sequence)).toEqual([FB, FC, FA]);
  });

  it("moves to the same position (no-op in terms of order)", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = moveFragment(sequence, FA, sectionUuid, 0);
    expect(fragmentUuids(sequence)).toEqual([FA, FB]);
  });

  it("moves across sections", () => {
    let sequence = makeSequence();
    sequence = {
      ...sequence,
      sections: [
        ...sequence.sections,
        { uuid: "22222222-0000-0000-0000-000000000001", name: "Act 2", fragments: [] },
      ],
    };
    const sectionA = sequence.sections[0]!.uuid;
    const sectionB = sequence.sections[1]!.uuid;

    sequence = placeFragment(sequence, FA, sectionA, 0);
    sequence = placeFragment(sequence, FB, sectionA, 1);
    sequence = placeFragment(sequence, FC, sectionB, 0);

    // Move FB from section A to section B at position 0
    sequence = moveFragment(sequence, FB, sectionB, 0);

    expect(fragmentUuids(sequence, 0)).toEqual([FA]);
    expect(fragmentUuids(sequence, 1)).toEqual([FB, FC]);
  });

  it("positions are dense and 0-based after cross-section move", () => {
    let sequence = makeSequence();
    sequence = {
      ...sequence,
      sections: [
        ...sequence.sections,
        { uuid: "22222222-0000-0000-0000-000000000002", name: "Act 2", fragments: [] },
      ],
    };
    const sectionA = sequence.sections[0]!.uuid;
    const sectionB = sequence.sections[1]!.uuid;

    sequence = placeFragment(sequence, FA, sectionA, 0);
    sequence = placeFragment(sequence, FB, sectionA, 1);
    sequence = placeFragment(sequence, FC, sectionA, 2);
    sequence = placeFragment(sequence, FD, sectionB, 0);

    sequence = moveFragment(sequence, FB, sectionB, 0);
    validateSequenceInvariants(sequence);
  });

  it("throws when fragment is not placed", () => {
    const sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    expect(() => moveFragment(sequence, FA, sectionUuid, 0)).toThrow();
  });

  it("throws when target section is not found", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    expect(() => moveFragment(sequence, FA, "00000000-0000-0000-0000-000000000000", 0)).toThrow();
  });
});

describe("unplaceFragment", () => {
  it("removes the fragment and re-compacts", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = placeFragment(sequence, FC, sectionUuid, 2);
    sequence = unplaceFragment(sequence, FB);
    expect(fragmentUuids(sequence)).toEqual([FA, FC]);
    validateSequenceInvariants(sequence);
  });

  it("removes the only fragment, leaving an empty section", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = unplaceFragment(sequence, FA);
    expect(sequence.sections[0]!.fragments).toHaveLength(0);
  });

  it("throws when fragment is not placed", () => {
    const sequence = makeSequence();
    expect(() => unplaceFragment(sequence, FA)).toThrow();
  });
});

describe("getUnassignedFragmentUuids", () => {
  it("returns all fragments when none are placed", () => {
    const sequence = makeSequence();
    const all = [FA, FB, FC];
    expect(getUnassignedFragmentUuids(sequence, all)).toEqual(all);
  });

  it("excludes placed fragments", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    expect(getUnassignedFragmentUuids(sequence, [FA, FB, FC])).toEqual([FC]);
  });

  it("returns empty array when all fragments are placed", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    expect(getUnassignedFragmentUuids(sequence, [FA, FB])).toEqual([]);
  });

  it("excludes fragments across multiple sections", () => {
    let sequence = makeSequence();
    sequence = {
      ...sequence,
      sections: [
        ...sequence.sections,
        { uuid: "33333333-0000-0000-0000-000000000001", name: "Act 2", fragments: [] },
      ],
    };
    const sectionA = sequence.sections[0]!.uuid;
    const sectionB = sequence.sections[1]!.uuid;
    sequence = placeFragment(sequence, FA, sectionA, 0);
    sequence = placeFragment(sequence, FC, sectionB, 0);
    expect(getUnassignedFragmentUuids(sequence, [FA, FB, FC, FD])).toEqual([FB, FD]);
  });
});

describe("getFragmentOrder", () => {
  it("returns empty array for an empty sequence", () => {
    const sequence = makeSequence();
    expect(getFragmentOrder(sequence)).toEqual([]);
  });

  it("returns fragments sorted by position within a single section", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    sequence = placeFragment(sequence, FC, sectionUuid, 2);
    expect(getFragmentOrder(sequence)).toEqual([FA, FB, FC]);
  });

  it("returns fragments across multiple sections in section-array order", () => {
    let sequence = makeSequence();
    const section2Uuid = "22222222-0000-0000-0000-000000000001";
    sequence = {
      ...sequence,
      sections: [
        ...sequence.sections,
        { uuid: section2Uuid, name: "Act 2", fragments: [] },
      ],
    };
    const sectionA = sequence.sections[0]!.uuid;
    const sectionB = sequence.sections[1]!.uuid;
    sequence = placeFragment(sequence, FA, sectionA, 0);
    sequence = placeFragment(sequence, FB, sectionA, 1);
    sequence = placeFragment(sequence, FC, sectionB, 0);
    sequence = placeFragment(sequence, FD, sectionB, 1);
    expect(getFragmentOrder(sequence)).toEqual([FA, FB, FC, FD]);
  });

  it("skips sections with zero fragments interspersed between populated sections", () => {
    let sequence = makeSequence();
    const section2Uuid = "22222222-0000-0000-0000-000000000002";
    const section3Uuid = "33333333-0000-0000-0000-000000000003";
    sequence = {
      ...sequence,
      sections: [
        ...sequence.sections,
        { uuid: section2Uuid, name: "Empty", fragments: [] },
        { uuid: section3Uuid, name: "Act 3", fragments: [] },
      ],
    };
    const sectionA = sequence.sections[0]!.uuid;
    const sectionC = sequence.sections[2]!.uuid;
    sequence = placeFragment(sequence, FA, sectionA, 0);
    sequence = placeFragment(sequence, FB, sectionC, 0);
    expect(getFragmentOrder(sequence)).toEqual([FA, FB]);
  });
});

describe("computeViolations", () => {
  const SECONDARY_A_UUID = "11111111-1111-1111-1111-111111111111";
  const SECONDARY_B_UUID = "22222222-2222-2222-2222-222222222222";

  function makeMain(): Sequence {
    return createDefaultSequence(PROJECT_UUID, "Main");
  }

  function makeSecondary(uuid: string, name: string): Sequence {
    const sectionUuid = `${uuid.slice(0, 8)}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
    return {
      uuid,
      name,
      isMain: false,
      projectUuid: PROJECT_UUID,
      sections: [{ uuid: sectionUuid, name: "", fragments: [] }],
    };
  }

  function placeAll(sequence: Sequence, fragmentUuids: string[]): Sequence {
    const sectionUuid = sequence.sections[0]!.uuid;
    let next = sequence;
    for (let i = 0; i < fragmentUuids.length; i++) {
      next = placeFragment(next, fragmentUuids[i]!, sectionUuid, i);
    }
    return next;
  }

  it("returns no violations when main matches the secondary order", () => {
    const main = placeAll(makeMain(), [FA, FB, FC]);
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB, FC]);
    expect(computeViolations(main, [secondary])).toEqual([]);
  });

  it("returns no violations when there are no secondaries", () => {
    const main = placeAll(makeMain(), [FA, FB, FC]);
    expect(computeViolations(main, [])).toEqual([]);
  });

  it("reports a single violation when one adjacent pair is reversed in main", () => {
    const main = placeAll(makeMain(), [FB, FA, FC]);
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB, FC]);
    const violations = computeViolations(main, [secondary]);
    expect(violations).toEqual([
      { fragmentUuid: FB, predecessorUuid: FA, secondaryUuid: SECONDARY_A_UUID },
    ]);
  });

  it("reports multiple violations on one fragment when several predecessors land after it in main", () => {
    const main = placeAll(makeMain(), [FD, FA, FB, FC]);
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB, FC, FD]);
    const violations = computeViolations(main, [secondary]);
    expect(violations).toHaveLength(3);
    expect(violations).toContainEqual({
      fragmentUuid: FD,
      predecessorUuid: FA,
      secondaryUuid: SECONDARY_A_UUID,
    });
    expect(violations).toContainEqual({
      fragmentUuid: FD,
      predecessorUuid: FB,
      secondaryUuid: SECONDARY_A_UUID,
    });
    expect(violations).toContainEqual({
      fragmentUuid: FD,
      predecessorUuid: FC,
      secondaryUuid: SECONDARY_A_UUID,
    });
  });

  it("attributes violations to each secondary independently when a fragment is in multiple secondaries", () => {
    const main = placeAll(makeMain(), [FB, FA]);
    const secondaryA = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    const secondaryB = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FA, FB]);
    const violations = computeViolations(main, [secondaryA, secondaryB]);
    expect(violations).toHaveLength(2);
    expect(violations).toContainEqual({
      fragmentUuid: FB,
      predecessorUuid: FA,
      secondaryUuid: SECONDARY_A_UUID,
    });
    expect(violations).toContainEqual({
      fragmentUuid: FB,
      predecessorUuid: FA,
      secondaryUuid: SECONDARY_B_UUID,
    });
  });

  it("does not emit a violation when only one endpoint of a constraint is placed in main", () => {
    const main = placeAll(makeMain(), [FA]);
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    expect(computeViolations(main, [secondary])).toEqual([]);
  });

  it("does not emit a violation when the predecessor is placed but the successor is not", () => {
    const main = placeAll(makeMain(), [FB]);
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    expect(computeViolations(main, [secondary])).toEqual([]);
  });

  it("skips secondaries that participate in a cycle", () => {
    const main = placeAll(makeMain(), [FB, FA]);
    const secondaryAtoB = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    const secondaryBtoA = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FB, FA]);
    expect(computeViolations(main, [secondaryAtoB, secondaryBtoA])).toEqual([]);
  });

  it("does not skip non-cyclic secondaries when other secondaries form a cycle", () => {
    const SECONDARY_C_UUID = "33333333-3333-3333-3333-333333333333";
    const main = placeAll(makeMain(), [FB, FA, FD, FC]);
    const cyclicAtoB = placeAll(makeSecondary(SECONDARY_A_UUID, "Cyclic A->B"), [FA, FB]);
    const cyclicBtoA = placeAll(makeSecondary(SECONDARY_B_UUID, "Cyclic B->A"), [FB, FA]);
    const independent = placeAll(makeSecondary(SECONDARY_C_UUID, "Independent"), [FC, FD]);
    const violations = computeViolations(main, [cyclicAtoB, cyclicBtoA, independent]);
    expect(violations).toEqual([
      { fragmentUuid: FD, predecessorUuid: FC, secondaryUuid: SECONDARY_C_UUID },
    ]);
  });
});

describe("detectCycles", () => {
  const SECONDARY_A_UUID = "11111111-1111-1111-1111-111111111111";
  const SECONDARY_B_UUID = "22222222-2222-2222-2222-222222222222";
  const SECONDARY_C_UUID = "33333333-3333-3333-3333-333333333333";
  const SECONDARY_D_UUID = "44444444-4444-4444-4444-444444444444";

  function makeSecondary(uuid: string, name: string): Sequence {
    const sectionUuid = `${uuid.slice(0, 8)}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
    return {
      uuid,
      name,
      isMain: false,
      projectUuid: PROJECT_UUID,
      sections: [{ uuid: sectionUuid, name: "", fragments: [] }],
    };
  }

  function placeAll(sequence: Sequence, fragmentUuids: string[]): Sequence {
    const sectionUuid = sequence.sections[0]!.uuid;
    let next = sequence;
    for (let i = 0; i < fragmentUuids.length; i++) {
      next = placeFragment(next, fragmentUuids[i]!, sectionUuid, i);
    }
    return next;
  }

  it("returns no cycles when there are no secondaries", () => {
    expect(detectCycles([])).toEqual([]);
  });

  it("returns no cycles when secondaries are consistent", () => {
    const secondaryA = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB, FC]);
    const secondaryB = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FA, FC]);
    expect(detectCycles([secondaryA, secondaryB])).toEqual([]);
  });

  it("does not report a trivial single-node SCC", () => {
    const secondary = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA]);
    expect(detectCycles([secondary])).toEqual([]);
  });

  it("detects a 2-node cycle across two secondaries", () => {
    const secondaryAtoB = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    const secondaryBtoA = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FB, FA]);
    const cycles = detectCycles([secondaryAtoB, secondaryBtoA]);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fragmentUuids].sort()).toEqual([FA, FB].sort());
    expect([...cycles[0]!.sequenceUuids].sort()).toEqual([SECONDARY_A_UUID, SECONDARY_B_UUID].sort());
  });

  it("detects a 3-node cycle spanning three secondaries", () => {
    const secondaryAtoB = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    const secondaryBtoC = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FB, FC]);
    const secondaryCtoA = placeAll(makeSecondary(SECONDARY_C_UUID, "S3"), [FC, FA]);
    const cycles = detectCycles([secondaryAtoB, secondaryBtoC, secondaryCtoA]);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.fragmentUuids].sort()).toEqual([FA, FB, FC].sort());
    expect([...cycles[0]!.sequenceUuids].sort()).toEqual(
      [SECONDARY_A_UUID, SECONDARY_B_UUID, SECONDARY_C_UUID].sort(),
    );
  });

  it("detects multiple independent cycles", () => {
    const cycleOneAB = placeAll(makeSecondary(SECONDARY_A_UUID, "S1"), [FA, FB]);
    const cycleOneBA = placeAll(makeSecondary(SECONDARY_B_UUID, "S2"), [FB, FA]);
    const cycleTwoCD = placeAll(makeSecondary(SECONDARY_C_UUID, "S3"), [FC, FD]);
    const cycleTwoDC = placeAll(makeSecondary(SECONDARY_D_UUID, "S4"), [FD, FC]);

    const cycles = detectCycles([cycleOneAB, cycleOneBA, cycleTwoCD, cycleTwoDC]);
    expect(cycles).toHaveLength(2);

    const cycleAB = cycles.find((c) => c.fragmentUuids.includes(FA));
    const cycleCD = cycles.find((c) => c.fragmentUuids.includes(FC));
    expect(cycleAB).toBeDefined();
    expect(cycleCD).toBeDefined();
    expect([...cycleAB!.fragmentUuids].sort()).toEqual([FA, FB].sort());
    expect([...cycleAB!.sequenceUuids].sort()).toEqual(
      [SECONDARY_A_UUID, SECONDARY_B_UUID].sort(),
    );
    expect([...cycleCD!.fragmentUuids].sort()).toEqual([FC, FD].sort());
    expect([...cycleCD!.sequenceUuids].sort()).toEqual(
      [SECONDARY_C_UUID, SECONDARY_D_UUID].sort(),
    );
  });

  it("only reports secondaries whose edges live inside the SCC", () => {
    const inCycleAB = placeAll(makeSecondary(SECONDARY_A_UUID, "Cyclic A->B"), [FA, FB]);
    const inCycleBA = placeAll(makeSecondary(SECONDARY_B_UUID, "Cyclic B->A"), [FB, FA]);
    const unrelated = placeAll(makeSecondary(SECONDARY_C_UUID, "Unrelated"), [FC, FD]);
    const cycles = detectCycles([inCycleAB, inCycleBA, unrelated]);
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!.sequenceUuids].sort()).toEqual(
      [SECONDARY_A_UUID, SECONDARY_B_UUID].sort(),
    );
  });
});

describe("validateSequenceInvariants", () => {
  it("passes for a valid sequence", () => {
    let sequence = makeSequence();
    const sectionUuid = mainSectionUuid(sequence);
    sequence = placeFragment(sequence, FA, sectionUuid, 0);
    sequence = placeFragment(sequence, FB, sectionUuid, 1);
    expect(() => validateSequenceInvariants(sequence)).not.toThrow();
  });

  it("throws when positions are not dense", () => {
    const sequence = makeSequence();
    const badSequence: Sequence = {
      ...sequence,
      sections: [
        {
          ...sequence.sections[0]!,
          fragments: [
            { uuid: crypto.randomUUID(), fragmentUuid: FA, position: 0 },
            { uuid: crypto.randomUUID(), fragmentUuid: FB, position: 2 },
          ],
        },
      ],
    };
    expect(() => validateSequenceInvariants(badSequence)).toThrow();
  });

  it("throws when a fragment appears in two sections", () => {
    const sequence = makeSequence();
    const duplicateSequence: Sequence = {
      ...sequence,
      sections: [
        {
          ...sequence.sections[0]!,
          fragments: [{ uuid: crypto.randomUUID(), fragmentUuid: FA, position: 0 }],
        },
        {
          uuid: "44444444-0000-0000-0000-000000000001",
          name: "Act 2",
          fragments: [{ uuid: crypto.randomUUID(), fragmentUuid: FA, position: 0 }],
        },
      ],
    };
    expect(() => validateSequenceInvariants(duplicateSequence)).toThrow();
  });
});
