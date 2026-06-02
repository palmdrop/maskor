import { describe, it, expect } from "vitest";
import { deriveLiveExcerpts } from "./excerpts";

describe("deriveLiveExcerpts", () => {
  const content = "Opening of one. <!--c:a-->\n\nOpening of two. <!--c:b-->";

  it("maps each present marker to its block's live opening", () => {
    expect(deriveLiveExcerpts(content, ["a", "b"])).toEqual({
      a: "Opening of one.",
      b: "Opening of two.",
    });
  });

  it("omits markers absent from the buffer (orphans fall back to stored excerpt)", () => {
    expect(deriveLiveExcerpts(content, ["a", "gone"])).toEqual({ a: "Opening of one." });
  });

  it("tracks a moved paragraph (excerpt follows the marker, not an ordinal)", () => {
    const moved = "Opening of two. <!--c:b-->\n\nOpening of one. <!--c:a-->";
    expect(deriveLiveExcerpts(moved, ["a", "b"])).toEqual({
      a: "Opening of one.",
      b: "Opening of two.",
    });
  });
});
