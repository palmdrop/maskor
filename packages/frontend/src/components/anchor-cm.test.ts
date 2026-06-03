import { describe, it, expect } from "vitest";
import { EditorState } from "@uiw/react-codemirror";
import { cmAnchorField, setCmAnchorsEffect, getCmAnchors, cmAnchorBlockIndex } from "./anchor-cm";

const make = (doc: string) => EditorState.create({ doc, extensions: [cmAnchorField] });

describe("cm anchors (ADR 0009)", () => {
  it("holds anchors set via the effect and resolves them to blocks", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "a", offset: 6 }]) }).state;
    expect(getCmAnchors(state)).toEqual([{ markerId: "a", offset: 6 }]);
    // offset 6 is the end of "First." (block 0).
    expect(cmAnchorBlockIndex(state).get("a")).toBe(0);
  });

  it("maps anchor offsets forward through an edit in an earlier block", () => {
    let state = make("First.\n\nSecond.");
    // Anchor at the end of block 1 ("Second." ends at offset 15).
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "b", offset: 15 }]) }).state;
    expect(cmAnchorBlockIndex(state).get("b")).toBe(1);
    // Insert 3 chars at the very start; the offset shifts but the anchor stays on block 1.
    state = state.update({ changes: { from: 0, insert: "Hey" } }).state;
    expect(getCmAnchors(state)[0]!.offset).toBe(18);
    expect(cmAnchorBlockIndex(state).get("b")).toBe(1);
  });
});
