import { describe, it, expect } from "bun:test";
import {
  buildCommentMarker,
  createCommentMarkerId,
  extractCommentMarkerIds,
  hasCommentMarker,
  stripCommentMarkers,
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
