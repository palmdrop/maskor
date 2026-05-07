import { describe, it, expect, beforeEach } from "bun:test";
import { CooldownSet, COOLDOWN_WINDOW_MS } from "../../suggestion/cooldown";

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
};

let cooldown: CooldownSet;

beforeEach(() => {
  cooldown = new CooldownSet();
});

describe("CooldownSet.add / has", () => {
  it("tracks a surfaced fragment", () => {
    cooldown.add("a");
    expect(cooldown.has("a")).toBe(true);
  });

  it("returns false for unsurfaced fragments", () => {
    expect(cooldown.has("b")).toBe(false);
  });
});

describe("CooldownSet.markEdited / wasEditedWhileSurfaced", () => {
  it("defaults to not edited", () => {
    cooldown.add("a");
    expect(cooldown.wasEditedWhileSurfaced("a")).toBe(false);
  });

  it("reflects true after marking", () => {
    cooldown.add("a");
    cooldown.markEdited("a");
    expect(cooldown.wasEditedWhileSurfaced("a")).toBe(true);
  });

  it("returns false for unknown UUIDs", () => {
    expect(cooldown.wasEditedWhileSurfaced("unknown")).toBe(false);
  });
});

describe("CooldownSet.purgeExpired", () => {
  it("removes entries past the window", () => {
    cooldown.add("a");
    const future = new Date(Date.now() + COOLDOWN_WINDOW_MS + 1000);
    cooldown.purgeExpired(future);
    expect(cooldown.has("a")).toBe(false);
  });

  it("keeps entries within the window", () => {
    cooldown.add("a");
    const shortly = new Date(Date.now() + 60_000);
    cooldown.purgeExpired(shortly);
    expect(cooldown.has("a")).toBe(true);
  });
});

describe("CooldownSet.getEligible", () => {
  it("returns fragments not in cooldown", () => {
    cooldown.add("a");
    const eligible = cooldown.getEligible(["a", "b", "c"], seededRng(1));
    expect(eligible).toContain("b");
    expect(eligible).toContain("c");
    expect(eligible).not.toContain("a");
  });

  it("falls back to all-cooled pool when every fragment is cooled", () => {
    cooldown.add("a");
    cooldown.add("b");
    const eligible = cooldown.getEligible(["a", "b"], seededRng(1));
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((uuid) => ["a", "b"].includes(uuid))).toBe(true);
  });

  it("fallback includes all cooled entries", () => {
    cooldown.add("a");
    cooldown.add("b");

    const eligible = cooldown.getEligible(["a", "b"], seededRng(42));
    expect(eligible.length).toBe(2);
    expect(eligible).toContain("a");
    expect(eligible).toContain("b");
  });

  it("purges expired entries before determining eligibility", () => {
    cooldown.add("a");
    const future = new Date(Date.now() + COOLDOWN_WINDOW_MS + 1000);
    const eligible = cooldown.getEligible(["a", "b"], seededRng(1), future);
    expect(eligible).toContain("a");
    expect(eligible).toContain("b");
  });
});
