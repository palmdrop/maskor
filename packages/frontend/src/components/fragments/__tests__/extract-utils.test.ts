import { describe, it, expect } from "vitest";
import { findSmallestUnusedSuffix, validateExtractKey } from "../extract-utils";

describe("findSmallestUnusedSuffix", () => {
  it("returns 1 when no unnamed-fragment keys exist", () => {
    expect(findSmallestUnusedSuffix(new Set())).toBe(1);
    expect(findSmallestUnusedSuffix(new Set(["other-key", "something-else"]))).toBe(1);
  });

  it("returns 1 when only unnamed-fragment-2 exists", () => {
    expect(findSmallestUnusedSuffix(new Set(["unnamed-fragment-2"]))).toBe(1);
  });

  it("skips gaps and returns the smallest unused n", () => {
    const keys = new Set(["unnamed-fragment-1", "unnamed-fragment-2", "unnamed-fragment-3"]);
    expect(findSmallestUnusedSuffix(keys)).toBe(4);
  });

  it("finds a gap in the middle", () => {
    const keys = new Set(["unnamed-fragment-1", "unnamed-fragment-3"]);
    expect(findSmallestUnusedSuffix(keys)).toBe(2);
  });

  it("counts discarded fragments (they are in the keys set)", () => {
    const keys = new Set(["unnamed-fragment-1"]);
    expect(findSmallestUnusedSuffix(keys)).toBe(2);
  });

  it("uses a custom prefix when provided", () => {
    expect(findSmallestUnusedSuffix(new Set(), "unnamed-note")).toBe(1);
    expect(findSmallestUnusedSuffix(new Set(["unnamed-note-1"]), "unnamed-note")).toBe(2);
    expect(
      findSmallestUnusedSuffix(new Set(["unnamed-note-1", "unnamed-note-2"]), "unnamed-note"),
    ).toBe(3);
  });

  it("custom prefix does not collide with the default prefix", () => {
    const keys = new Set(["unnamed-fragment-1", "unnamed-fragment-2"]);
    expect(findSmallestUnusedSuffix(keys, "unnamed-note")).toBe(1);
  });
});

describe("validateExtractKey", () => {
  const noKeys = new Set<string>();
  const noDiscarded = new Set<string>();

  it("returns error when key is empty", () => {
    expect(validateExtractKey("", noKeys, noDiscarded)).toBe("Key is required");
    expect(validateExtractKey("   ", noKeys, noDiscarded)).toBe("Key is required");
  });

  it("returns error when key contains illegal characters", () => {
    expect(validateExtractKey("bad/key", noKeys, noDiscarded)).toMatch(/letters, numbers/);
    expect(validateExtractKey("bad.key", noKeys, noDiscarded)).toMatch(/letters, numbers/);
  });

  it("accepts valid keys with letters, numbers, hyphens, underscores, spaces", () => {
    expect(validateExtractKey("my-fragment", noKeys, noDiscarded)).toBeNull();
    expect(validateExtractKey("fragment 1", noKeys, noDiscarded)).toBeNull();
    expect(validateExtractKey("fragment_one", noKeys, noDiscarded)).toBeNull();
    expect(validateExtractKey("My Fragment 2", noKeys, noDiscarded)).toBeNull();
  });

  it("returns discarded-specific message when key clashes with a discarded fragment", () => {
    const discarded = new Set(["used-key"]);
    const all = new Set(["used-key"]);
    const result = validateExtractKey("used-key", all, discarded);
    expect(result).toBe("A discarded fragment uses this key. Restore or rename it first.");
  });

  it("returns live-clash message when key clashes with a live fragment", () => {
    const all = new Set(["taken-key"]);
    const result = validateExtractKey("taken-key", all, noDiscarded);
    expect(result).toBe("A fragment with this key already exists");
  });

  it("returns entity-type-specific clash message for non-fragment types", () => {
    const all = new Set(["taken-key"]);
    expect(validateExtractKey("taken-key", all, noDiscarded, "note")).toBe(
      "A note with this key already exists",
    );
    expect(validateExtractKey("taken-key", all, noDiscarded, "reference")).toBe(
      "A reference with this key already exists",
    );
    expect(validateExtractKey("taken-key", all, noDiscarded, "aspect")).toBe(
      "An aspect with this key already exists",
    );
  });

  it("returns null when key is valid and unused", () => {
    const all = new Set(["other-key"]);
    expect(validateExtractKey("new-key", all, noDiscarded)).toBeNull();
  });

  it("checks trimmed key against the key sets", () => {
    const all = new Set(["taken"]);
    expect(validateExtractKey("  taken  ", all, noDiscarded)).toBe(
      "A fragment with this key already exists",
    );
  });
});
