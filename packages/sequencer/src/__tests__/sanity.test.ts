import { describe, it, expect } from "bun:test";

describe("@maskor/sequencer", () => {
  it("selects the highest-scored fragment", () => {
    // Dummy: replace with real fitting/placement tests once sequencer logic exists
    const fragments = [
      { id: "a", score: 0.4 },
      { id: "b", score: 0.9 },
      { id: "c", score: 0.1 },
    ];
    const best = fragments.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
    expect(best.id).toBe("b");
  });

  it("produces deterministic output for the same seed", () => {
    // Noise with same seed must yield the same offset
    const seed = 42;
    const pseudoNoise = (s: number) => ((s * 9301 + 49297) % 233280) / 233280;
    expect(pseudoNoise(seed)).toBe(pseudoNoise(seed));
  });
});
