import { describe, it, expect } from "vitest";
import { computeBlockAlignment, naturalSlotHeights, spacersEqual } from "./alignment";

describe("computeBlockAlignment", () => {
  it("pads a short comment to its slot and injects no spacer", () => {
    const [row] = computeBlockAlignment([{ naturalSlotHeight: 100, commentHeight: 40 }]);
    expect(row).toEqual({ minHeight: 100, spacer: 0 });
  });

  it("injects a spacer for a comment taller than its slot (the document-side push)", () => {
    const [row] = computeBlockAlignment([{ naturalSlotHeight: 60, commentHeight: 150 }]);
    expect(row.minHeight).toBe(60);
    expect(row.spacer).toBe(90);
  });

  it("converges: feeding the pushed geometry back yields the same spacer", () => {
    const naturalSlotHeight = 60;
    const commentHeight = 150;
    const first = computeBlockAlignment([{ naturalSlotHeight, commentHeight }])[0]!;
    // After applying `first.spacer`, the measured top-delta grows by the spacer; backing it out must
    // recover the same natural slot height, so the recomputed spacer is unchanged.
    const recoveredSlot = naturalSlotHeights(
      [0, naturalSlotHeight + first.spacer],
      [naturalSlotHeight, 0],
      [first.spacer, 0],
    )[0]!;
    expect(recoveredSlot).toBe(naturalSlotHeight);
    const second = computeBlockAlignment([{ naturalSlotHeight: recoveredSlot, commentHeight }])[0]!;
    expect(second.spacer).toBe(first.spacer);
  });

  it("caps a runaway comment at maxSpacer", () => {
    const [row] = computeBlockAlignment([{ naturalSlotHeight: 50, commentHeight: 1000 }], 200);
    expect(row.spacer).toBe(200);
  });
});

describe("naturalSlotHeights", () => {
  it("uses the gap-inclusive distance to the next block, spacer backed out", () => {
    // block 0 top=0, block 1 top=120, an injected spacer of 30 below block 0 → natural slot = 90.
    const slots = naturalSlotHeights([0, 120], [70, 50], [30, 0]);
    expect(slots[0]).toBe(90);
  });

  it("falls back to own height for the last block", () => {
    const slots = naturalSlotHeights([0, 120], [70, 55], [0, 0]);
    expect(slots[1]).toBe(55);
  });
});

describe("spacersEqual", () => {
  it("treats sub-pixel differences as equal", () => {
    expect(spacersEqual([10, 20], [10.2, 19.8])).toBe(true);
    expect(spacersEqual([10], [12])).toBe(false);
    expect(spacersEqual([10], [10, 0])).toBe(false);
  });
});
