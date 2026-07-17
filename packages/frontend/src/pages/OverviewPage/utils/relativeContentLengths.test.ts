import { describe, it, expect } from "vitest";
import { computeRelativeContentLengths } from "./relativeContentLengths";

describe("computeRelativeContentLengths", () => {
  it("scales each fragment's content length against the longest fragment", () => {
    const contents = new Map([
      ["frag-1", "a".repeat(100)],
      ["frag-2", "a".repeat(50)],
      ["frag-3", "a".repeat(25)],
    ]);

    const ratios = computeRelativeContentLengths(["frag-1", "frag-2", "frag-3"], contents);

    expect(ratios.get("frag-1")).toBe(1);
    expect(ratios.get("frag-2")).toBe(0.5);
    expect(ratios.get("frag-3")).toBe(0.25);
  });

  it("omits fragments whose content has not loaded instead of treating them as empty", () => {
    const contents = new Map([["frag-1", "a".repeat(10)]]);

    const ratios = computeRelativeContentLengths(["frag-1", "frag-missing"], contents);

    expect(ratios.get("frag-1")).toBe(1);
    expect(ratios.has("frag-missing")).toBe(false);
  });

  it("only considers the given fragment uuids, not the whole content map", () => {
    const contents = new Map([
      ["frag-placed", "a".repeat(10)],
      ["frag-pool", "a".repeat(1000)],
    ]);

    const ratios = computeRelativeContentLengths(["frag-placed"], contents);

    expect(ratios.get("frag-placed")).toBe(1);
    expect(ratios.has("frag-pool")).toBe(false);
  });

  it("returns an empty map when no content is loaded or all contents are empty", () => {
    expect(computeRelativeContentLengths(["frag-1"], new Map()).size).toBe(0);
    expect(computeRelativeContentLengths(["frag-1"], new Map([["frag-1", ""]])).size).toBe(0);
  });
});
