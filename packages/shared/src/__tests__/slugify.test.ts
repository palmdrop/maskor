import { describe, it, expect } from "bun:test";
import { slugify } from "../utils/slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("The Bridge")).toBe("the-bridge");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("Late-Winter, 1987!")).toBe("late-winter-1987");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(slugify("The   Old   House")).toBe("the-old-house");
    expect(slugify("a--b")).toBe("a-b");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  harbour lights  ")).toBe("harbour-lights");
  });

  it("handles already-slugified strings", () => {
    expect(slugify("the-bridge")).toBe("the-bridge");
  });
});
