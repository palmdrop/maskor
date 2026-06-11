import { describe, it, expect } from "vitest";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { buildSequenceOrder, encodeSortMode, parseSortMode, sortFragments } from "./sort";

type Row = { uuid: string; key: string; updatedAt: string };

const rows: Row[] = [
  { uuid: "a", key: "Charlie", updatedAt: "2026-01-03T00:00:00.000Z" },
  { uuid: "b", key: "alpha", updatedAt: "2026-01-01T00:00:00.000Z" },
  { uuid: "c", key: "Bravo", updatedAt: "2026-01-02T00:00:00.000Z" },
];

const sequence = (): Sequence => ({
  uuid: "seq-1",
  name: "Manuscript",
  isMain: true,
  active: true,
  projectUuid: "p1",
  filePath: "main.yaml",
  contentHash: "hash",
  sections: [
    {
      uuid: "sec-2",
      name: "Act II",
      // Out-of-order positions to prove position sorting within a section.
      fragments: [
        { uuid: "p2", fragmentUuid: "a", position: 1 },
        { uuid: "p1", fragmentUuid: "c", position: 0 },
      ],
    },
    {
      uuid: "sec-1",
      name: "Act I",
      fragments: [{ uuid: "p3", fragmentUuid: "b", position: 0 }],
    },
  ],
});

describe("parseSortMode / encodeSortMode", () => {
  it("round-trips name, updatedAt, and sequence modes", () => {
    expect(parseSortMode("name")).toEqual({ kind: "name" });
    expect(parseSortMode("updatedAt")).toEqual({ kind: "updatedAt" });
    expect(parseSortMode("sequence:seq-1")).toEqual({ kind: "sequence", sequenceUuid: "seq-1" });
    expect(encodeSortMode({ kind: "name" })).toBe("name");
    expect(encodeSortMode({ kind: "updatedAt" })).toBe("updatedAt");
    expect(encodeSortMode({ kind: "sequence", sequenceUuid: "x" })).toBe("sequence:x");
  });

  it("falls back to name for unknown values", () => {
    expect(parseSortMode("garbage")).toEqual({ kind: "name" });
  });
});

describe("buildSequenceOrder", () => {
  it("flattens sections in array order, fragments by position", () => {
    const order = buildSequenceOrder(sequence());
    // sec-2 first: c (pos 0) then a (pos 1), then sec-1: b.
    expect(order.get("c")).toBe(0);
    expect(order.get("a")).toBe(1);
    expect(order.get("b")).toBe(2);
  });
});

describe("sortFragments", () => {
  it("sorts by key case-insensitively for name mode", () => {
    const result = sortFragments(rows, { kind: "name" }).map((r) => r.key);
    expect(result).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("sorts most-recently-updated first for updatedAt mode", () => {
    const result = sortFragments(rows, { kind: "updatedAt" }).map((r) => r.uuid);
    expect(result).toEqual(["a", "c", "b"]);
  });

  it("orders placed fragments by sequence, unplaced at the bottom by key", () => {
    const order = buildSequenceOrder(sequence());
    const extended: Row[] = [
      ...rows,
      { uuid: "z", key: "Zeta", updatedAt: "2026-01-09T00:00:00.000Z" },
      { uuid: "y", key: "delta", updatedAt: "2026-01-08T00:00:00.000Z" },
    ];
    const result = sortFragments(extended, { kind: "sequence", sequenceUuid: "seq-1" }, order).map(
      (r) => r.uuid,
    );
    // Placed: c, a, b (sequence order). Unplaced: delta (y), Zeta (z) by key.
    expect(result).toEqual(["c", "a", "b", "y", "z"]);
  });

  it("does not mutate the input array", () => {
    const input = [...rows];
    sortFragments(input, { kind: "name" });
    expect(input).toEqual(rows);
  });
});
