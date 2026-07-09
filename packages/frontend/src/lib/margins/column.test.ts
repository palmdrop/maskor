import { describe, it, expect } from "vitest";
import {
  buildColumn,
  computeCommentClipHeights,
  computeCoveredSlots,
  planOrphanRebinds,
  resolveColumnBlocks,
  nextSlotIndex,
  previousSlotIndex,
} from "./column";
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

describe("resolveColumnBlocks (transient-orphan gate)", () => {
  it("reuses the previous blocks when the incoming list transiently empties while comments exist", () => {
    const previous = enumerateBlocks("Anchored. <!--c:a-->");
    const comments = [comment("a", "on a")];
    // Mid-reload: the editor momentarily reports zero blocks. The comment must stay bound, not orphan.
    expect(resolveColumnBlocks([], previous, comments)).toBe(previous);
    // buildColumn over the reused list keeps the comment anchored (no orphan flicker).
    const { rows, orphans } = buildColumn(resolveColumnBlocks([], previous, comments), comments);
    expect(rows.map((row) => row.comment?.markerId ?? null)).toEqual(["a"]);
    expect(orphans).toEqual([]);
  });

  it("takes the incoming list once the reload settles (non-empty)", () => {
    const previous = enumerateBlocks("Old. <!--c:a-->");
    const incoming = enumerateBlocks("New. <!--c:a-->");
    expect(resolveColumnBlocks(incoming, previous, [comment("a")])).toBe(incoming);
  });

  it("does not reuse when there are no comments to protect (empty is genuine)", () => {
    const previous = enumerateBlocks("Gone.");
    expect(resolveColumnBlocks([], previous, [])).toEqual([]);
  });

  it("lets a genuine orphaning demote promptly (marker removed, list still non-empty)", () => {
    // The block survives, only its marker was stripped — the incoming list is non-empty, so the gate
    // does not fire and buildColumn orphans the now-unbound comment.
    const previous = enumerateBlocks("Anchored. <!--c:a-->");
    const incoming = enumerateBlocks("Anchored.");
    const comments = [comment("a", "on a", "Anchored.")];
    const resolved = resolveColumnBlocks(incoming, previous, comments);
    expect(resolved).toBe(incoming);
    expect(buildColumn(resolved, comments).orphans.map((orphan) => orphan.markerId)).toEqual(["a"]);
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

describe("computeCommentClipHeights", () => {
  it("returns null for a comment with no comment below (it may extend freely)", () => {
    expect(
      computeCommentClipHeights([
        { top: 0, hasComment: true },
        { top: 60, hasComment: false },
      ]),
    ).toEqual([null, null]);
  });

  it("clips a comment to the distance to the next comment's top, spanning empty blocks", () => {
    // Comment at top 0, two empty blocks, then a comment at top 150 → the first clips to 150.
    expect(
      computeCommentClipHeights([
        { top: 0, hasComment: true },
        { top: 50, hasComment: false },
        { top: 100, hasComment: false },
        { top: 150, hasComment: true },
      ]),
    ).toEqual([150, 100, 50, null]);
  });

  it("clips to ~one block when the next comment is adjacent", () => {
    expect(
      computeCommentClipHeights([
        { top: 0, hasComment: true },
        { top: 80, hasComment: true },
      ]),
    ).toEqual([80, null]);
  });

  it("does not clip on a non-positive gap (degenerate out-of-order tops)", () => {
    // Out-of-order tops yield no room to clip into → unclipped (null), never a 0px / negative box.
    expect(
      computeCommentClipHeights([
        { top: 100, hasComment: true },
        { top: 40, hasComment: true },
      ]),
    ).toEqual([null, null]);
  });
});

describe("computeCoveredSlots", () => {
  it("marks empty slots after an overflowing comment as covered, up to the next comment", () => {
    expect(
      computeCoveredSlots([
        { hasComment: true, isOverflowing: true },
        { hasComment: false, isOverflowing: false },
        { hasComment: false, isOverflowing: false },
        { hasComment: true, isOverflowing: false },
        { hasComment: false, isOverflowing: false },
      ]),
    ).toEqual([false, true, true, false, false]);
  });

  it("does not cover empty slots below a comment that fits (non-overflowing)", () => {
    expect(
      computeCoveredSlots([
        { hasComment: true, isOverflowing: false },
        { hasComment: false, isOverflowing: false },
      ]),
    ).toEqual([false, false]);
  });

  it("never marks a commented row itself as covered", () => {
    expect(
      computeCoveredSlots([
        { hasComment: true, isOverflowing: true },
        { hasComment: true, isOverflowing: true },
      ]),
    ).toEqual([false, false]);
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
