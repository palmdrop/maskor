import { describe, it, expect } from "vitest";
import { orderNeighbors, overviewEditOrder } from "./order-neighbors";

describe("orderNeighbors", () => {
  const order = ["a", "b", "c"];

  it("returns both neighbours for a middle item", () => {
    expect(orderNeighbors(order, "b")).toEqual({
      previousUuid: "a",
      nextUuid: "c",
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("disables Previous at the first item", () => {
    expect(orderNeighbors(order, "a")).toMatchObject({
      previousUuid: null,
      nextUuid: "b",
      hasPrevious: false,
      hasNext: true,
    });
  });

  it("disables Next at the last item", () => {
    expect(orderNeighbors(order, "c")).toMatchObject({
      previousUuid: "b",
      nextUuid: null,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it("clamps both directions when the uuid is no longer in the order (removed/filtered)", () => {
    expect(orderNeighbors(order, "gone")).toEqual({
      previousUuid: null,
      nextUuid: null,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("clamps both directions for a null active uuid", () => {
    expect(orderNeighbors(order, null)).toMatchObject({ hasPrevious: false, hasNext: false });
  });

  it("disables both for a single-item order", () => {
    expect(orderNeighbors(["only"], "only")).toEqual({
      previousUuid: null,
      nextUuid: null,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("disables both for an empty order", () => {
    expect(orderNeighbors([], "a")).toMatchObject({ hasPrevious: false, hasNext: false });
  });
});

describe("overviewEditOrder", () => {
  const fragmentByUuid = new Map<string, { isDiscarded?: boolean }>([
    ["a", { isDiscarded: false }],
    ["b", { isDiscarded: true }],
    ["c", {}],
  ]);

  it("keeps placed order but drops discarded fragments", () => {
    expect(overviewEditOrder(["a", "b", "c"], fragmentByUuid)).toEqual(["a", "c"]);
  });

  it("treats an unknown uuid as not-discarded (kept)", () => {
    expect(overviewEditOrder(["a", "z"], fragmentByUuid)).toEqual(["a", "z"]);
  });

  it("composes with orderNeighbors to skip a discarded fragment between two placed ones", () => {
    const editable = overviewEditOrder(["a", "b", "c"], fragmentByUuid);
    // 'b' is discarded, so 'a' steps straight to 'c'.
    expect(orderNeighbors(editable, "a").nextUuid).toBe("c");
  });
});
