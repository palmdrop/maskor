import { describe, it, expect } from "bun:test";
import {
  aspectWeightsEqual,
  classifyUpdate,
  diffAspectWeights,
  diffStringSet,
  stringArraysEqual,
} from "../../commands/split-update";

describe("classifyUpdate", () => {
  it("returns 'none' when nothing changed", () => {
    expect(classifyUpdate(false, false)).toBe("none");
  });

  it("returns 'renamed' when only the key changed", () => {
    expect(classifyUpdate(true, false)).toBe("renamed");
  });

  it("returns 'updated' when only non-key fields changed", () => {
    expect(classifyUpdate(false, true)).toBe("updated");
  });

  it("returns 'both' when key and non-key fields changed", () => {
    expect(classifyUpdate(true, true)).toBe("both");
  });
});

describe("stringArraysEqual", () => {
  it("treats identical arrays as equal", () => {
    expect(stringArraysEqual(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("treats different lengths as unequal", () => {
    expect(stringArraysEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("treats reordered arrays as unequal", () => {
    expect(stringArraysEqual(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("treats empty arrays as equal", () => {
    expect(stringArraysEqual([], [])).toBe(true);
  });
});

describe("aspectWeightsEqual", () => {
  it("treats maps with the same keys and weights as equal", () => {
    expect(
      aspectWeightsEqual({ tone: { weight: 0.5 } }, { tone: { weight: 0.5 } }),
    ).toBe(true);
  });

  it("detects a weight change", () => {
    expect(
      aspectWeightsEqual({ tone: { weight: 0.5 } }, { tone: { weight: 0.6 } }),
    ).toBe(false);
  });

  it("detects a key added", () => {
    expect(
      aspectWeightsEqual({ tone: { weight: 0.5 } }, { tone: { weight: 0.5 }, mood: { weight: 0.2 } }),
    ).toBe(false);
  });

  it("detects a key removed", () => {
    expect(
      aspectWeightsEqual({ tone: { weight: 0.5 }, mood: { weight: 0.2 } }, { tone: { weight: 0.5 } }),
    ).toBe(false);
  });

  it("treats empty maps as equal", () => {
    expect(aspectWeightsEqual({}, {})).toBe(true);
  });
});

describe("diffStringSet", () => {
  it("returns empty diffs for identical arrays", () => {
    expect(diffStringSet(["a", "b"], ["a", "b"])).toEqual({ added: [], removed: [] });
  });

  it("detects an addition", () => {
    expect(diffStringSet(["a"], ["a", "b"])).toEqual({ added: ["b"], removed: [] });
  });

  it("detects a removal", () => {
    expect(diffStringSet(["a", "b"], ["a"])).toEqual({ added: [], removed: ["b"] });
  });

  it("detects simultaneous addition and removal", () => {
    expect(diffStringSet(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });

  it("handles empty before", () => {
    expect(diffStringSet([], ["x"])).toEqual({ added: ["x"], removed: [] });
  });

  it("handles empty after", () => {
    expect(diffStringSet(["x"], [])).toEqual({ added: [], removed: ["x"] });
  });
});

describe("diffAspectWeights", () => {
  it("returns empty diffs for identical maps", () => {
    expect(diffAspectWeights({ tone: { weight: 0.5 } }, { tone: { weight: 0.5 } })).toEqual({
      added: [],
      removed: [],
      weightChanged: [],
    });
  });

  it("detects a new aspect", () => {
    const result = diffAspectWeights({}, { tone: { weight: 0.5 } });
    expect(result.added).toEqual([{ key: "tone", weight: 0.5 }]);
    expect(result.removed).toEqual([]);
    expect(result.weightChanged).toEqual([]);
  });

  it("detects a removed aspect", () => {
    const result = diffAspectWeights({ tone: { weight: 0.5 } }, {});
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["tone"]);
    expect(result.weightChanged).toEqual([]);
  });

  it("detects a weight change", () => {
    const result = diffAspectWeights({ tone: { weight: 0.5 } }, { tone: { weight: 0.8 } });
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.weightChanged).toEqual([{ key: "tone", from: 0.5, to: 0.8 }]);
  });

  it("handles simultaneous add, remove, and weight change", () => {
    const result = diffAspectWeights(
      { tone: { weight: 0.5 }, mood: { weight: 0.3 } },
      { tone: { weight: 0.7 }, pacing: { weight: 0.2 } },
    );
    expect(result.added).toEqual([{ key: "pacing", weight: 0.2 }]);
    expect(result.removed).toEqual(["mood"]);
    expect(result.weightChanged).toEqual([{ key: "tone", from: 0.5, to: 0.7 }]);
  });

  it("returns empty diffs for empty maps", () => {
    expect(diffAspectWeights({}, {})).toEqual({ added: [], removed: [], weightChanged: [] });
  });
});
