import { describe, it, expect } from "vitest";
import { buildLengthSeries, LENGTH_SERIES_KEY } from "./lengthData";

const PANEL_HEIGHT = 100;

describe("buildLengthSeries", () => {
  it("maps relative length to y (ratio 1 → top, ratio → 0 → bottom)", () => {
    const series = buildLengthSeries(
      ["a", "b"],
      new Map([
        ["a", 1],
        ["b", 0.25],
      ]),
      new Map([
        ["a", 10],
        ["b", 20],
      ]),
      PANEL_HEIGHT,
    );

    expect(series).toHaveLength(1);
    expect(series[0]!.aspectKey).toBe(LENGTH_SERIES_KEY);
    expect(series[0]!.points).toEqual([
      { x: 10, y: 0, fragmentUuid: "a" },
      { x: 20, y: 75, fragmentUuid: "b" },
    ]);
  });

  it("preserves the ordered fragment sequence", () => {
    const series = buildLengthSeries(
      ["c", "a", "b"],
      new Map([
        ["a", 0.5],
        ["b", 0.5],
        ["c", 0.5],
      ]),
      new Map([
        ["a", 5],
        ["b", 15],
        ["c", 25],
      ]),
      PANEL_HEIGHT,
    );

    expect(series[0]!.points.map((point) => point.fragmentUuid)).toEqual(["c", "a", "b"]);
  });

  it("omits fragments whose content has not loaded (absent ratio)", () => {
    const series = buildLengthSeries(
      ["a", "b"],
      new Map([["a", 1]]),
      new Map([
        ["a", 10],
        ["b", 20],
      ]),
      PANEL_HEIGHT,
    );

    expect(series[0]!.points.map((point) => point.fragmentUuid)).toEqual(["a"]);
  });

  it("omits fragments with no x-center", () => {
    const series = buildLengthSeries(
      ["a", "b"],
      new Map([
        ["a", 1],
        ["b", 0.5],
      ]),
      new Map([["a", 10]]),
      PANEL_HEIGHT,
    );

    expect(series[0]!.points.map((point) => point.fragmentUuid)).toEqual(["a"]);
  });

  it("returns an empty array when no fragment yields a point", () => {
    expect(buildLengthSeries([], new Map(), new Map(), PANEL_HEIGHT)).toEqual([]);
    expect(buildLengthSeries(["a"], new Map(), new Map([["a", 10]]), PANEL_HEIGHT)).toEqual([]);
  });

  it("clamps out-of-range ratios into the panel", () => {
    const series = buildLengthSeries(
      ["a", "b"],
      new Map([
        ["a", 1.5],
        ["b", -0.5],
      ]),
      new Map([
        ["a", 10],
        ["b", 20],
      ]),
      PANEL_HEIGHT,
    );

    expect(series[0]!.points).toEqual([
      { x: 10, y: 0, fragmentUuid: "a" },
      { x: 20, y: 100, fragmentUuid: "b" },
    ]);
  });
});
