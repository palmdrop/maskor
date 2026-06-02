import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { claimFocusOnPickerClose, consumeFocusClaim } from "./focus-intent";

beforeEach(() => {
  vi.useFakeTimers();
  // Drain any leftover claim from a previous test.
  consumeFocusClaim();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("focus-intent", () => {
  it("hands the registered claim to the consumer (the closing Picker)", () => {
    const claim = vi.fn();
    claimFocusOnPickerClose(claim);
    const consumed = consumeFocusClaim();
    expect(consumed).toBe(claim);
    consumed?.();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("returns null when nothing is claimed", () => {
    expect(consumeFocusClaim()).toBeNull();
  });

  it("expires an unconsumed claim so a later Picker close does not run a stale focus", () => {
    const claim = vi.fn();
    claimFocusOnPickerClose(claim);
    vi.advanceTimersByTime(200);
    expect(consumeFocusClaim()).toBeNull();
  });

  it("does not expire the wrong claim when a newer one replaces it", () => {
    const stale = vi.fn();
    claimFocusOnPickerClose(stale);
    // Register a newer claim partway through the stale claim's TTL.
    vi.advanceTimersByTime(100);
    const fresh = vi.fn();
    claimFocusOnPickerClose(fresh);
    // The stale claim's expiry timer fires (at t=200) but must not clear the newer claim (alive
    // until t=300).
    vi.advanceTimersByTime(100);
    expect(consumeFocusClaim()).toBe(fresh);
  });
});
