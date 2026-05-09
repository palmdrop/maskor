import { describe, it, expect } from "bun:test";
import { aspectWeightsEqual, classifyUpdate, stringArraysEqual } from "../../commands/split-update";

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
