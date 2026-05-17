import { describe, it, expect } from "vitest";
import { deriveSlug, resolveSlug } from "./slug";

describe("deriveSlug", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(deriveSlug("My Novel")).toBe("my-novel");
  });

  it("ASCII-folds accented chars", () => {
    expect(deriveSlug("Café au Lait")).toBe("cafe-au-lait");
  });

  it("handles leading numbers", () => {
    expect(deriveSlug("123 Project")).toBe("123-project");
  });

  it("falls back to 'project' when result is empty after stripping", () => {
    expect(deriveSlug("---")).toBe("project");
    expect(deriveSlug("")).toBe("project");
    expect(deriveSlug("!@#$%")).toBe("project");
  });

  it("collapses repeated hyphens from multiple non-alphanumeric chars", () => {
    expect(deriveSlug("hello   world")).toBe("hello-world");
  });

  it("strips leading and trailing hyphens", () => {
    expect(deriveSlug(" hello ")).toBe("hello");
  });
});

describe("resolveSlug", () => {
  it("returns base slug when no collision", () => {
    expect(resolveSlug("my-novel", new Set())).toBe("my-novel");
  });

  it("suffixes -2 on first collision", () => {
    expect(resolveSlug("my-novel", new Set(["my-novel"]))).toBe("my-novel-2");
  });

  it("increments suffix until no collision", () => {
    expect(resolveSlug("my-novel", new Set(["my-novel", "my-novel-2"]))).toBe("my-novel-3");
  });
});
