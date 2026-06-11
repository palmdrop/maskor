import { describe, it, expect } from "vitest";
import { resolveOverviewLoadScroll } from "./loadScroll";

describe("resolveOverviewLoadScroll", () => {
  it("scrolls to an external deep-link anchor over the remembered scroll", () => {
    expect(
      resolveOverviewLoadScroll({
        activeAnchorId: "frag-1",
        authoredAnchor: null,
        persistedOffset: 500,
      }),
    ).toEqual({ kind: "anchor", anchorId: "frag-1" });
  });

  it("treats an anchor authored by a different fragment as external", () => {
    expect(
      resolveOverviewLoadScroll({
        activeAnchorId: "frag-2",
        authoredAnchor: "frag-1",
        persistedOffset: 500,
      }),
    ).toEqual({ kind: "anchor", anchorId: "frag-2" });
  });

  it("restores the remembered scroll when the anchor is our own leftover click", () => {
    expect(
      resolveOverviewLoadScroll({
        activeAnchorId: "frag-1",
        authoredAnchor: "frag-1",
        persistedOffset: 500,
      }),
    ).toEqual({ kind: "scroll", offset: 500 });
  });

  it("restores the remembered scroll when there is no anchor", () => {
    expect(
      resolveOverviewLoadScroll({
        activeAnchorId: null,
        authoredAnchor: null,
        persistedOffset: 320,
      }),
    ).toEqual({ kind: "scroll", offset: 320 });
  });

  it("does nothing when there is neither an external anchor nor a stored offset", () => {
    expect(
      resolveOverviewLoadScroll({
        activeAnchorId: "frag-1",
        authoredAnchor: "frag-1",
        persistedOffset: null,
      }),
    ).toEqual({ kind: "none" });
  });
});
