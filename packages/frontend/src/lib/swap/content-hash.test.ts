import { describe, it, expect } from "vitest";
import { hashContent } from "./content-hash";

describe("hashContent", () => {
  it("is stable for the same input", () => {
    expect(hashContent("hello world")).toBe(hashContent("hello world"));
  });

  it("changes when the content changes", () => {
    expect(hashContent("hello world")).not.toBe(hashContent("hello worlds"));
  });

  it("ignores trailing whitespace (matches the server's body.trim() normalization)", () => {
    // The server re-normalizes trailing whitespace on save, so a trailing-newline-only difference
    // must not read as a changed baseline — otherwise a save round-trip would look like a conflict.
    expect(hashContent("some prose")).toBe(hashContent("some prose\n"));
    expect(hashContent("some prose")).toBe(hashContent("some prose   \n\n"));
  });

  it("does NOT ignore leading whitespace (only trailing is normalized)", () => {
    expect(hashContent("  some prose")).not.toBe(hashContent("some prose"));
  });

  it("returns a non-empty string for empty input", () => {
    expect(hashContent("")).toEqual(expect.any(String));
    expect(hashContent("").length).toBeGreaterThan(0);
  });
});
