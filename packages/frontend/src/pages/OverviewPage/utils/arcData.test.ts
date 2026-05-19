import { describe, it, expect } from "vitest";
import { buildArcSeries, catmullRomPath, type ArcPoint } from "./arcData";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";

const PANEL_HEIGHT = 100;

const makeFragment = (
  uuid: string,
  key: string,
  aspects: Record<string, { weight: number }>,
): FragmentSummary => ({
  uuid,
  key,
  isDiscarded: false,
  excerpt: null,
  aspects,
});

const makeCenters = (entries: Array<[string, number]>) => new Map(entries);
const makeFragmentMap = (fragments: FragmentSummary[]) =>
  new Map(fragments.map((fragment) => [fragment.uuid, fragment]));

describe("buildArcSeries", () => {
  it("returns one series per aspect that has at least one weighted point", () => {
    const fragments = [
      makeFragment("f1", "a", { grief: { weight: 0.6 }, city: { weight: 0.3 } }),
      makeFragment("f2", "b", { grief: { weight: 0.8 } }),
      makeFragment("f3", "c", {}),
    ];
    const series = buildArcSeries(
      ["f1", "f2", "f3"],
      makeFragmentMap(fragments),
      makeCenters([
        ["f1", 100],
        ["f2", 200],
        ["f3", 300],
      ]),
      PANEL_HEIGHT,
    );

    const aspectKeys = series.map((s) => s.aspectKey).sort();
    expect(aspectKeys).toEqual(["city", "grief"]);
    expect(series.find((s) => s.aspectKey === "grief")?.points).toHaveLength(2);
    expect(series.find((s) => s.aspectKey === "city")?.points).toHaveLength(1);
  });

  it("skips fragments with no weight for an aspect (does not interpolate zeros)", () => {
    const fragments = [
      makeFragment("f1", "a", { grief: { weight: 0.6 } }),
      makeFragment("f2", "b", {}), // no grief
      makeFragment("f3", "c", { grief: { weight: 0.4 } }),
    ];
    const series = buildArcSeries(
      ["f1", "f2", "f3"],
      makeFragmentMap(fragments),
      makeCenters([
        ["f1", 100],
        ["f2", 200],
        ["f3", 300],
      ]),
      PANEL_HEIGHT,
    );

    const grief = series.find((s) => s.aspectKey === "grief");
    expect(grief?.points.map((p) => p.fragmentUuid)).toEqual(["f1", "f3"]);
  });

  it("places points at the tile center x-coordinate from the layout map", () => {
    const fragments = [makeFragment("f1", "a", { grief: { weight: 1 } })];
    const series = buildArcSeries(
      ["f1"],
      makeFragmentMap(fragments),
      makeCenters([["f1", 173]]),
      PANEL_HEIGHT,
    );
    expect(series[0]?.points[0]?.x).toBe(173);
  });

  it("maps weight=1 to y=0 (top) and weight=0.5 to y=panelHeight/2", () => {
    const fragments = [
      makeFragment("f1", "a", { grief: { weight: 1 } }),
      makeFragment("f2", "b", { grief: { weight: 0.5 } }),
    ];
    const series = buildArcSeries(
      ["f1", "f2"],
      makeFragmentMap(fragments),
      makeCenters([
        ["f1", 100],
        ["f2", 200],
      ]),
      PANEL_HEIGHT,
    );
    const points = series[0]?.points ?? [];
    expect(points[0]?.y).toBe(0);
    expect(points[1]?.y).toBe(50);
  });

  it("clamps weights above 1 down to 1 when computing y", () => {
    const fragments = [makeFragment("f1", "a", { grief: { weight: 5 } })];
    const series = buildArcSeries(
      ["f1"],
      makeFragmentMap(fragments),
      makeCenters([["f1", 100]]),
      PANEL_HEIGHT,
    );
    expect(series[0]?.points[0]?.y).toBe(0);
  });

  it("plots an explicit weight=0 at the floor of the panel (not skipped)", () => {
    const fragments = [
      makeFragment("f1", "a", { grief: { weight: 0.6 } }),
      makeFragment("f2", "b", { grief: { weight: 0 } }),
    ];
    const series = buildArcSeries(
      ["f1", "f2"],
      makeFragmentMap(fragments),
      makeCenters([
        ["f1", 100],
        ["f2", 200],
      ]),
      PANEL_HEIGHT,
    );
    const grief = series.find((s) => s.aspectKey === "grief");
    expect(grief?.points).toHaveLength(2);
    expect(grief?.points[1]?.y).toBe(PANEL_HEIGHT);
  });

  it("skips fragments not present in the center map", () => {
    const fragments = [
      makeFragment("f1", "a", { grief: { weight: 0.6 } }),
      makeFragment("f2", "b", { grief: { weight: 0.4 } }),
    ];
    // f2 is not in the center map; it must be ignored
    const series = buildArcSeries(
      ["f1", "f2"],
      makeFragmentMap(fragments),
      makeCenters([["f1", 100]]),
      PANEL_HEIGHT,
    );
    expect(series[0]?.points.map((p) => p.fragmentUuid)).toEqual(["f1"]);
  });

  it("returns an empty array when there are no placed fragments", () => {
    expect(buildArcSeries([], new Map(), new Map(), PANEL_HEIGHT)).toEqual([]);
  });
});

describe("catmullRomPath", () => {
  const point = (x: number, y: number): ArcPoint => ({ x, y, fragmentUuid: `${x}` });

  it("returns an empty string for fewer than two points", () => {
    expect(catmullRomPath([])).toBe("");
    expect(catmullRomPath([point(10, 20)])).toBe("");
  });

  it("emits one M followed by one C per segment for n points", () => {
    const path = catmullRomPath([point(0, 0), point(10, 10), point(20, 0), point(30, 10)]);
    expect(path.startsWith("M 0 0")).toBe(true);
    // n points → n-1 segments → n-1 'C ' commands
    expect(path.match(/C /g)).toHaveLength(3);
  });

  it("passes through each input point as a Bezier endpoint", () => {
    // Each "C ... endX endY" segment ends at the next point. Check that the
    // last 'C ...' ends at the last point's coordinates.
    const path = catmullRomPath([point(0, 0), point(50, 25), point(100, 0)]);
    expect(path).toContain(" 100 0");
  });
});
