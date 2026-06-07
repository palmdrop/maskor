import { describe, it, expect } from "vitest";
import { pixelArraysEqual } from "./alignment";

describe("pixelArraysEqual", () => {
  it("treats sub-pixel differences as equal", () => {
    expect(pixelArraysEqual([10, 20], [10.2, 19.8])).toBe(true);
  });

  it("treats a difference beyond the epsilon as unequal", () => {
    expect(pixelArraysEqual([10], [12])).toBe(false);
  });

  it("treats different lengths as unequal", () => {
    expect(pixelArraysEqual([10], [10, 0])).toBe(false);
  });
});
