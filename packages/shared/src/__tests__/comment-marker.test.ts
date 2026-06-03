import { describe, it, expect } from "bun:test";
import {
  buildCommentMarker,
  createCommentMarkerId,
  extractCommentMarkerIds,
  hasCommentMarker,
  stripCommentMarkers,
  stripCommentMarker,
  deriveExcerpt,
  extractBlockOpening,
  EXCERPT_MAX_LENGTH,
  splitCommentMarkers,
  insertCommentMarkers,
} from "../utils/comment-marker";

describe("buildCommentMarker", () => {
  it("wraps an id in the namespaced HTML comment", () => {
    expect(buildCommentMarker("abc123")).toBe("<!--c:abc123-->");
  });
});

describe("createCommentMarkerId", () => {
  it("produces url-safe ids that round-trip through the regex", () => {
    const id = createCommentMarkerId();
    const text = `A block ${buildCommentMarker(id)}`;
    expect(extractCommentMarkerIds(text)).toEqual([id]);
  });

  it("produces distinct ids", () => {
    expect(createCommentMarkerId()).not.toBe(createCommentMarkerId());
  });
});

describe("extractCommentMarkerIds", () => {
  it("returns ids in document order", () => {
    const text = "one <!--c:aaa--> two <!--c:bbb-->";
    expect(extractCommentMarkerIds(text)).toEqual(["aaa", "bbb"]);
  });

  it("returns an empty list when there are no markers", () => {
    expect(extractCommentMarkerIds("plain prose")).toEqual([]);
  });
});

describe("hasCommentMarker", () => {
  it("detects a present marker", () => {
    expect(hasCommentMarker("text <!--c:xyz-->", "xyz")).toBe(true);
    expect(hasCommentMarker("text <!--c:xyz-->", "nope")).toBe(false);
  });
});

describe("stripCommentMarkers", () => {
  it("removes a marker and its leading whitespace", () => {
    expect(stripCommentMarkers("The bridge groans <!--c:abc123-->")).toBe("The bridge groans");
  });

  it("removes multiple markers across lines", () => {
    const input = "Line one <!--c:aaa-->\nLine two<!--c:bbb-->";
    expect(stripCommentMarkers(input)).toBe("Line one\nLine two");
  });

  it("leaves marker-free text untouched", () => {
    expect(stripCommentMarkers("nothing here")).toBe("nothing here");
  });
});

describe("stripCommentMarker (single)", () => {
  it("removes only the named marker (and its leading whitespace)", () => {
    const input = `One ${buildCommentMarker("a")} two ${buildCommentMarker("b")}`;
    expect(stripCommentMarker(input, "a")).toBe(`One two ${buildCommentMarker("b")}`);
  });

  it("is a no-op when the marker is absent", () => {
    const input = `Only ${buildCommentMarker("b")}`;
    expect(stripCommentMarker(input, "a")).toBe(input);
  });
});

describe("deriveExcerpt", () => {
  it("strips markers, collapses whitespace, and trims", () => {
    expect(deriveExcerpt("  The   bridge\n groans <!--c:abc-->  ")).toBe("The bridge groans");
  });

  it("caps at the max length with an ellipsis", () => {
    const long = "a".repeat(EXCERPT_MAX_LENGTH + 50);
    const excerpt = deriveExcerpt(long);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBe(EXCERPT_MAX_LENGTH + 1); // cap + the ellipsis char
  });

  it("leaves a short block uncapped", () => {
    expect(deriveExcerpt("short opening")).toBe("short opening");
  });
});

describe("extractBlockOpening", () => {
  const content = "First paragraph here.\n\nSecond paragraph. <!--c:m2-->\n\nThird one.";

  it("returns the opening of the block carrying the marker", () => {
    expect(extractBlockOpening(content, "m2")).toBe("Second paragraph.");
  });

  it("returns null when the marker is absent (orphaned)", () => {
    expect(extractBlockOpening(content, "missing")).toBeNull();
  });

  it("derives the opening from a multi-line block", () => {
    const block = "Line one\nline two <!--c:m-->";
    expect(extractBlockOpening(block, "m")).toBe("Line one line two");
  });
});

describe("splitCommentMarkers / insertCommentMarkers", () => {
  it("splits markers out and records their clean-text offsets", () => {
    const { clean, anchors } = splitCommentMarkers("First.<!--c:a-->\n\nSecond.<!--c:b-->");
    expect(clean).toBe("First.\n\nSecond.");
    expect(anchors).toEqual([
      { markerId: "a", offset: 6 },
      { markerId: "b", offset: 15 },
    ]);
  });

  it("round-trips: insert is the inverse of split (byte-stable)", () => {
    const original = "Alpha.<!--c:x-->\n\nBeta line\nmore <!--c:y-->\n\nGamma.";
    const { clean, anchors } = splitCommentMarkers(original);
    expect(insertCommentMarkers(clean, anchors)).toBe(original);
  });

  it("preserves whitespace before a marker (no leading-space eating)", () => {
    const { clean, anchors } = splitCommentMarkers("Trailing space <!--c:a-->");
    expect(clean).toBe("Trailing space ");
    expect(insertCommentMarkers(clean, anchors)).toBe("Trailing space <!--c:a-->");
  });

  it("clamps drifted offsets into range", () => {
    expect(insertCommentMarkers("abc", [{ markerId: "a", offset: 999 }])).toBe("abc<!--c:a-->");
  });
});
