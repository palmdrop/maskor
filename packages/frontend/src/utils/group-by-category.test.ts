import { describe, it, expect } from "vitest";
import { groupByCategory } from "./group-by-category";

type Item = { key: string; category?: string | null };

describe("groupByCategory", () => {
  it("returns empty array for empty input", () => {
    expect(groupByCategory([], (i: Item) => i.category)).toEqual([]);
  });

  it("null/undefined category goes into the null group, placed first", () => {
    const items: Item[] = [
      { key: "a", category: "books" },
      { key: "b", category: null },
      { key: "c", category: undefined },
    ];
    const groups = groupByCategory(items, (i) => i.category);
    expect(groups[0]!.category).toBeNull();
    expect(groups[0]!.items.map((i) => i.key)).toEqual(["b", "c"]);
  });

  it("named categories are sorted alphabetically after the null group", () => {
    const items: Item[] = [
      { key: "1", category: "world/places" },
      { key: "2", category: "characters" },
      { key: "3", category: null },
      { key: "4", category: "arcs" },
    ];
    const groups = groupByCategory(items, (i) => i.category);
    expect(groups.map((g) => g.category)).toEqual([null, "arcs", "characters", "world/places"]);
  });

  it("items within each group preserve insertion order", () => {
    const items: Item[] = [
      { key: "z", category: "alpha" },
      { key: "a", category: "alpha" },
      { key: "m", category: "alpha" },
    ];
    const groups = groupByCategory(items, (i) => i.category);
    expect(groups[0]!.items.map((i) => i.key)).toEqual(["z", "a", "m"]);
  });

  it("all-root items: single null group, no named groups", () => {
    const items: Item[] = [{ key: "x" }, { key: "y" }];
    const groups = groupByCategory(items, (i) => i.category);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBeNull();
  });

  it("no root items: null group omitted entirely", () => {
    const items: Item[] = [
      { key: "a", category: "books" },
      { key: "b", category: "films" },
    ];
    const groups = groupByCategory(items, (i) => i.category);
    expect(groups.every((g) => g.category !== null)).toBe(true);
    expect(groups.map((g) => g.category)).toEqual(["books", "films"]);
  });
});
