import { describe, it, expect } from "bun:test";
import { type Sequence, createSeededRandom } from "@maskor/shared";
import {
  createDefaultSequence,
  placeFragment,
  generateShuffledSequence,
  computeRandomLinearExtension,
  buildConstraintGraph,
  ShuffleConstraintCycleError,
} from "../index";

const PROJECT_UUID = "00000000-0000-0000-0000-000000000001";

const FA = "aaaaaaaa-0000-0000-0000-000000000001";
const FB = "bbbbbbbb-0000-0000-0000-000000000001";
const FC = "cccccccc-0000-0000-0000-000000000001";
const FD = "dddddddd-0000-0000-0000-000000000001";
const FE = "eeeeeeee-0000-0000-0000-000000000001";
const FF = "ffffffff-0000-0000-0000-000000000001";

// A secondary sequence whose flat order is the given fragments — a constraint chain.
function chain(...uuids: string[]): Sequence {
  let sequence = createDefaultSequence(PROJECT_UUID, "chain");
  const sectionUuid = sequence.sections[0]!.uuid;
  uuids.forEach((uuid, index) => {
    sequence = placeFragment(sequence, uuid, sectionUuid, index);
  });
  return sequence;
}

function flatOrder(sequence: Sequence): string[] {
  return [...sequence.sections[0]!.fragments]
    .sort((a, b) => a.position - b.position)
    .map((fragment) => fragment.fragmentUuid);
}

function indexOf(order: string[], uuid: string): number {
  return order.indexOf(uuid);
}

describe("generateShuffledSequence — output shape", () => {
  it("returns a non-main, active, single-section sequence named Main", () => {
    const result = generateShuffledSequence({
      projectUuid: PROJECT_UUID,
      name: "Random 1",
      fragmentUuids: [FA, FB, FC],
      constraintSequences: [],
      random: createSeededRandom(1),
    });
    expect(result.isMain).toBe(false);
    expect(result.active).toBe(true);
    expect(result.projectUuid).toBe(PROJECT_UUID);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.name).toBe("Main");
  });

  it("places every universe fragment exactly once with dense positions", () => {
    const universe = [FA, FB, FC, FD, FE];
    const result = generateShuffledSequence({
      projectUuid: PROJECT_UUID,
      name: "Random",
      fragmentUuids: universe,
      constraintSequences: [],
      random: createSeededRandom(7),
    });
    const order = flatOrder(result);
    expect(order.slice().sort()).toEqual(universe.slice().sort());
    const positions = result.sections[0]!.fragments.map((f) => f.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });

  it("produces an empty section for an empty universe", () => {
    const result = generateShuffledSequence({
      projectUuid: PROJECT_UUID,
      name: "Empty",
      fragmentUuids: [],
      constraintSequences: [],
      random: createSeededRandom(1),
    });
    expect(result.sections[0]!.fragments).toHaveLength(0);
  });
});

describe("generateShuffledSequence — constraints are hard-honored", () => {
  const universe = [FA, FB, FC, FD, FE, FF];

  it("honors a single chain (A → B → C) under every seed", () => {
    const constraint = chain(FA, FB, FC);
    for (let seed = 0; seed < 50; seed++) {
      const result = generateShuffledSequence({
        projectUuid: PROJECT_UUID,
        name: "Random",
        fragmentUuids: universe,
        constraintSequences: [constraint],
        random: createSeededRandom(seed),
      });
      const order = flatOrder(result);
      expect(indexOf(order, FA)).toBeLessThan(indexOf(order, FB));
      expect(indexOf(order, FB)).toBeLessThan(indexOf(order, FC));
    }
  });

  it("honors multiple chains simultaneously", () => {
    const constraints = [chain(FA, FB), chain(FE, FA), chain(FC, FD)];
    for (let seed = 0; seed < 50; seed++) {
      const order = flatOrder(
        generateShuffledSequence({
          projectUuid: PROJECT_UUID,
          name: "Random",
          fragmentUuids: universe,
          constraintSequences: constraints,
          random: createSeededRandom(seed),
        }),
      );
      expect(indexOf(order, FE)).toBeLessThan(indexOf(order, FA));
      expect(indexOf(order, FA)).toBeLessThan(indexOf(order, FB));
      expect(indexOf(order, FC)).toBeLessThan(indexOf(order, FD));
    }
  });

  it("skips out-of-universe fragments but keeps the transitive order of survivors", () => {
    // Chain A → D → B, but D is not in the universe (e.g. discarded).
    const constraint = chain(FA, FD, FB);
    const universeWithoutD = [FA, FB, FC];
    for (let seed = 0; seed < 30; seed++) {
      const order = flatOrder(
        generateShuffledSequence({
          projectUuid: PROJECT_UUID,
          name: "Random",
          fragmentUuids: universeWithoutD,
          constraintSequences: [constraint],
          random: createSeededRandom(seed),
        }),
      );
      expect(order).not.toContain(FD);
      expect(indexOf(order, FA)).toBeLessThan(indexOf(order, FB));
    }
  });
});

describe("generateShuffledSequence — randomness", () => {
  it("is deterministic under a fixed seed", () => {
    const universe = [FA, FB, FC, FD, FE, FF];
    const run = () =>
      flatOrder(
        generateShuffledSequence({
          projectUuid: PROJECT_UUID,
          name: "Random",
          fragmentUuids: universe,
          constraintSequences: [],
          random: createSeededRandom(123),
        }),
      );
    expect(run()).toEqual(run());
  });

  it("yields different orders for different seeds (unconstrained fragments spread)", () => {
    const universe = [FA, FB, FC, FD, FE, FF];
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      orders.add(
        flatOrder(
          generateShuffledSequence({
            projectUuid: PROJECT_UUID,
            name: "Random",
            fragmentUuids: universe,
            constraintSequences: [],
            random: createSeededRandom(seed),
          }),
        ).join(","),
      );
    }
    // With 6 fragments and 20 seeds, we expect many distinct orderings.
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("generateShuffledSequence — contradictory constraints", () => {
  it("throws ShuffleConstraintCycleError when two chains contradict over placed fragments", () => {
    const constraints = [chain(FA, FB), chain(FB, FA)];
    expect(() =>
      generateShuffledSequence({
        projectUuid: PROJECT_UUID,
        name: "Random",
        fragmentUuids: [FA, FB, FC],
        constraintSequences: constraints,
        random: createSeededRandom(1),
      }),
    ).toThrow(ShuffleConstraintCycleError);
  });

  it("reports the fragments involved in the cycle", () => {
    const constraints = [chain(FA, FB), chain(FB, FA)];
    try {
      generateShuffledSequence({
        projectUuid: PROJECT_UUID,
        name: "Random",
        fragmentUuids: [FA, FB],
        constraintSequences: constraints,
        random: createSeededRandom(1),
      });
      throw new Error("expected a cycle error");
    } catch (error) {
      expect(error).toBeInstanceOf(ShuffleConstraintCycleError);
      const cycle = (error as ShuffleConstraintCycleError).cycles[0]!;
      expect(cycle.fragmentUuids.slice().sort()).toEqual([FA, FB].slice().sort());
    }
  });

  it("does NOT throw when the contradiction only exists through an out-of-universe fragment", () => {
    // A → D and D → A contradict, but D is discarded / absent from the universe,
    // so among the surviving fragments there is no cycle.
    const constraints = [chain(FA, FD), chain(FD, FA)];
    expect(() =>
      generateShuffledSequence({
        projectUuid: PROJECT_UUID,
        name: "Random",
        fragmentUuids: [FA, FB],
        constraintSequences: constraints,
        random: createSeededRandom(1),
      }),
    ).not.toThrow();
  });
});

describe("computeRandomLinearExtension — direct", () => {
  it("returns every universe node once when unconstrained", () => {
    const graph = buildConstraintGraph([]);
    const order = computeRandomLinearExtension(graph, [FA, FB, FC], createSeededRandom(3));
    expect(order.slice().sort()).toEqual([FA, FB, FC].slice().sort());
  });
});
