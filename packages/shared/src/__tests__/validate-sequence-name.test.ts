import { describe, it, expect } from "bun:test";
import { validateSequenceName } from "../utils/validate-sequence-name";

describe("validateSequenceName", () => {
  it("returns the trimmed name", () => {
    expect(validateSequenceName("  Chapter arc  ")).toBe("Chapter arc");
  });

  it("accepts free-form characters (names are not entity keys)", () => {
    expect(validateSequenceName("Act I: the harbour / 1987?")).toBe("Act I: the harbour / 1987?");
  });

  it("throws on an empty name", () => {
    expect(() => validateSequenceName("")).toThrow("Sequence name must not be empty");
  });

  it("throws on a whitespace-only name", () => {
    expect(() => validateSequenceName("   ")).toThrow("Sequence name must not be empty");
  });
});
