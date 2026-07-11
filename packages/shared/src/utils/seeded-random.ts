// A minimal seeded pseudo-random number generator. A `RandomSource` is a
// zero-argument function returning a float in [0, 1) — the same shape as
// `Math.random`, so it drops in wherever randomness is needed while staying
// deterministic for a given seed. Reusable across the sequencer (shuffle now,
// noise / suggestion-mode later): callers inject a `RandomSource` so their own
// logic stays pure and unit-testable under a fixed seed.

export type RandomSource = () => number;

// mulberry32: a fast, well-distributed 32-bit PRNG. Same seed → same stream.
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw a fresh 32-bit seed from the platform RNG. Used when a caller wants a
// new, non-reproducible run but still records the seed for later reproduction.
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}
