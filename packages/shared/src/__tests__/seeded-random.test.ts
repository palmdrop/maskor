import { describe, it, expect } from "bun:test";
import { createSeededRandom, randomSeed } from "../utils/seeded-random";

describe("createSeededRandom", () => {
  it("produces the same stream for the same seed", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const streamA = Array.from({ length: 10 }, () => a());
    const streamB = Array.from({ length: 10 }, () => b());
    expect(streamA).toEqual(streamB);
  });

  it("produces different streams for different seeds", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    const streamA = Array.from({ length: 10 }, () => a());
    const streamB = Array.from({ length: 10 }, () => b());
    expect(streamA).not.toEqual(streamB);
  });

  it("returns floats in [0, 1)", () => {
    const random = createSeededRandom(99);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomSeed", () => {
  it("returns a non-negative 32-bit integer", () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
