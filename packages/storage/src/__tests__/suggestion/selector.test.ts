import { describe, it, expect } from "bun:test";
import { selectNextSuggestion } from "../../suggestion/selector";
import type { EligibleFragment } from "../../suggestion/selector";
import type { FragmentStats } from "../../suggestion/stats-repo";
import type { SuggestionWeights } from "../../suggestion/weights";

const weights: SuggestionWeights = {
  readyStatusWeight: 2.0,
  voluntaryOpenPenalty: 0.3,
  avoidancePenalty: 0.2,
  editCountWeight: 0.5,
};

const noStats = (): Map<string, FragmentStats> => new Map();

const makeStats = (overrides: Partial<FragmentStats> & { fragmentUuid: string }): FragmentStats => ({
  voluntaryOpenCount: 0,
  promptAcceptCount: 0,
  avoidanceCount: 0,
  editCount: 0,
  wordCount: 0,
  lastSurfacedAt: null,
  ...overrides,
});

// Seeded deterministic RNG (linear congruential generator).
const makeRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
};

describe("selectNextSuggestion — empty pool", () => {
  it("returns null when no fragments are eligible", () => {
    const result = selectNextSuggestion({
      eligibleFragments: [],
      stats: noStats(),
      rng: makeRng(42),
      weights,
    });
    expect(result).toBeNull();
  });
});

describe("selectNextSuggestion — single fragment", () => {
  it("returns the only eligible fragment regardless of stats", () => {
    const fragment: EligibleFragment = { uuid: "a", readyStatus: 0.5 };
    const result = selectNextSuggestion({
      eligibleFragments: [fragment],
      stats: noStats(),
      rng: makeRng(1),
      weights,
    });
    expect(result).toBe("a");
  });
});

describe("selectNextSuggestion — lower readyStatus surfaced more often", () => {
  it("favors the fragment with lower readyStatus in repeated runs", () => {
    const low: EligibleFragment = { uuid: "low", readyStatus: 0.1 };
    const high: EligibleFragment = { uuid: "high", readyStatus: 0.9 };

    const counts = { low: 0, high: 0 };
    for (let i = 0; i < 500; i++) {
      const selected = selectNextSuggestion({
        eligibleFragments: [low, high],
        stats: noStats(),
        rng: makeRng(i * 31 + 7),
        weights,
      });
      if (selected === "low") counts.low++;
      else if (selected === "high") counts.high++;
    }

    expect(counts.low).toBeGreaterThan(counts.high);
  });
});

describe("selectNextSuggestion — high voluntary open deprioritized", () => {
  it("surfaces frequently-visited fragments less often", () => {
    const frequent: EligibleFragment = { uuid: "frequent", readyStatus: 0.5 };
    const rare: EligibleFragment = { uuid: "rare", readyStatus: 0.5 };

    const stats = new Map<string, FragmentStats>([
      ["frequent", makeStats({ fragmentUuid: "frequent", voluntaryOpenCount: 20 })],
      ["rare", makeStats({ fragmentUuid: "rare", voluntaryOpenCount: 0 })],
    ]);

    const counts = { frequent: 0, rare: 0 };
    for (let i = 0; i < 500; i++) {
      const selected = selectNextSuggestion({
        eligibleFragments: [frequent, rare],
        stats,
        rng: makeRng(i * 13 + 3),
        weights,
      });
      if (selected === "frequent") counts.frequent++;
      else if (selected === "rare") counts.rare++;
    }

    expect(counts.rare).toBeGreaterThan(counts.frequent);
  });
});

describe("selectNextSuggestion — avoidance penalty caps but does not exclude", () => {
  it("heavily avoided fragment is still selectable", () => {
    const avoided: EligibleFragment = { uuid: "avoided", readyStatus: 0.5 };

    const stats = new Map<string, FragmentStats>([
      ["avoided", makeStats({ fragmentUuid: "avoided", avoidanceCount: 1000 })],
    ]);

    // With only one fragment, it must always be selected
    const result = selectNextSuggestion({
      eligibleFragments: [avoided],
      stats,
      rng: makeRng(99),
      weights,
    });
    expect(result).toBe("avoided");
  });

  it("heavily avoided fragment is selected less frequently than a non-avoided one", () => {
    const avoided: EligibleFragment = { uuid: "avoided", readyStatus: 0.5 };
    const normal: EligibleFragment = { uuid: "normal", readyStatus: 0.5 };

    const stats = new Map<string, FragmentStats>([
      ["avoided", makeStats({ fragmentUuid: "avoided", avoidanceCount: 50 })],
      ["normal", makeStats({ fragmentUuid: "normal", avoidanceCount: 0 })],
    ]);

    const counts = { avoided: 0, normal: 0 };
    for (let i = 0; i < 500; i++) {
      const selected = selectNextSuggestion({
        eligibleFragments: [avoided, normal],
        stats,
        rng: makeRng(i * 17 + 5),
        weights,
      });
      if (selected === "avoided") counts.avoided++;
      else if (selected === "normal") counts.normal++;
    }

    expect(counts.normal).toBeGreaterThan(counts.avoided);
  });
});
