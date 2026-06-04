import { describe, it, expect } from "vitest";
import { buildColumn, planOrphanRebinds, nextSlotIndex, previousSlotIndex } from "./column";
import { enumerateBlocks } from "./column.test-helpers";
import type { Comment } from "@api/generated/maskorAPI.schemas";

const comment = (markerId: string, body = "", excerpt = ""): Comment => ({
  markerId,
  excerpt,
  body,
});

describe("enumerateBlocks", () => {
  it("splits on blank lines and captures the marker per block", () => {
    const content = "First paragraph. <!--c:a-->\n\nSecond paragraph.\n\nThird. <!--c:c-->";
    const blocks = enumerateBlocks(content);
    expect(blocks).toEqual([
      { index: 0, text: "First paragraph.", markerId: "a" },
      { index: 1, text: "Second paragraph.", markerId: null },
      { index: 2, text: "Third.", markerId: "c" },
    ]);
  });

  it("skips blank runs and collapses multi-line blocks", () => {
    const content = "Line one\nline two\n\n\n\nNext block";
    const blocks = enumerateBlocks(content);
    expect(blocks.map((block) => block.text)).toEqual(["Line one line two", "Next block"]);
  });
});

describe("buildColumn", () => {
  it("binds each block to its comment and gathers orphans", () => {
    const blocks = enumerateBlocks("A <!--c:a-->\n\nB\n\nC <!--c:c-->");
    const { rows, orphans } = buildColumn(blocks, [
      comment("a", "on a"),
      comment("c", "on c"),
      comment("gone", "lost"),
    ]);
    expect(rows.map((row) => [row.block.text, row.comment?.markerId ?? null])).toEqual([
      ["A", "a"],
      ["B", null],
      ["C", "c"],
    ]);
    expect(orphans.map((orphan) => orphan.markerId)).toEqual(["gone"]);
  });

  it("follows a moved paragraph (binding from the live marker, not an ordinal)", () => {
    const moved = enumerateBlocks("C <!--c:c-->\n\nA <!--c:a-->");
    const { rows } = buildColumn(moved, [comment("a", "on a"), comment("c", "on c")]);
    // The comment travels with its marker: row order now follows the moved blocks.
    expect(rows.map((row) => [row.block.text, row.comment?.body])).toEqual([
      ["C", "on c"],
      ["A", "on a"],
    ]);
  });

  it("leaves an inert marker (no matching comment) as an un-annotated slot", () => {
    const blocks = enumerateBlocks("A <!--c:stray-->");
    const { rows, orphans } = buildColumn(blocks, []);
    expect(rows[0]?.comment).toBeNull();
    expect(orphans).toHaveLength(0);
  });
});

describe("planOrphanRebinds (fuzzy recovery)", () => {
  it("rebinds an orphan to the unique un-anchored block matching its excerpt", () => {
    const blocks = enumerateBlocks("Alpha paragraph. <!--c:a-->\n\nBeta paragraph.");
    expect(planOrphanRebinds(blocks, [comment("b", "", "Beta paragraph.")])).toEqual([
      { markerId: "b", blockIndex: 1 },
    ]);
  });

  it("does not rebind when the excerpt matches nothing", () => {
    const blocks = enumerateBlocks("Alpha.");
    expect(planOrphanRebinds(blocks, [comment("x", "", "Totally different.")])).toEqual([]);
  });

  it("does not steal a block already carrying an anchor", () => {
    const blocks = enumerateBlocks("Shared. <!--c:a-->");
    expect(planOrphanRebinds(blocks, [comment("b", "", "Shared.")])).toEqual([]);
  });

  it("never binds two orphans to the same block", () => {
    const blocks = enumerateBlocks("Same.");
    expect(
      planOrphanRebinds(blocks, [comment("b", "", "Same."), comment("c", "", "Same.")]),
    ).toEqual([{ markerId: "b", blockIndex: 0 }]);
  });
});

describe("slot navigation", () => {
  it("clamps next/previous to the row range", () => {
    expect(nextSlotIndex(0, 3)).toBe(1);
    expect(nextSlotIndex(2, 3)).toBe(2);
    expect(previousSlotIndex(1)).toBe(0);
    expect(previousSlotIndex(0)).toBe(0);
  });
});
