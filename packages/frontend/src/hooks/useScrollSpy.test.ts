import { describe, it, expect } from "vitest";
import { pickActiveAnchorId, type AnchorTop } from "./useScrollSpy";

// Anchors in document order; `top` is viewport-relative (smaller = higher up).
const anchors: AnchorTop[] = [
  { id: "a", top: -200 },
  { id: "b", top: -40 },
  { id: "c", top: 120 },
  { id: "d", top: 400 },
];

describe("pickActiveAnchorId", () => {
  it("returns null when there are no anchors", () => {
    expect(pickActiveAnchorId([], 100)).toBeNull();
  });

  it("picks the last anchor at or above the reading line", () => {
    // Line at 130: a, b, c are above (≤130), d is below.
    expect(pickActiveAnchorId(anchors, 130)).toBe("c");
  });

  it("treats an anchor exactly on the line as above it", () => {
    expect(pickActiveAnchorId(anchors, 120)).toBe("c");
  });

  it("falls back to the first anchor when all sit below the line", () => {
    // Scrolled to the very top: every anchor is below the line.
    expect(pickActiveAnchorId(anchors, -500)).toBe("a");
  });

  it("returns the last anchor when all sit above the line", () => {
    expect(pickActiveAnchorId(anchors, 1000)).toBe("d");
  });

  it("is direction-agnostic — same layout yields the same active id", () => {
    // The active fragment depends only on positions vs. the line, so the result
    // is identical whether the user arrived by scrolling up or down.
    const line = 200;
    expect(pickActiveAnchorId(anchors, line)).toBe("c");
    expect(pickActiveAnchorId([...anchors].reverse().reverse(), line)).toBe("c");
  });
});
