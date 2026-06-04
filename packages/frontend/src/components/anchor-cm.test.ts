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

  it("drops an anchor whose block is deleted, instead of collapsing it to the boundary (margins-4 #7)", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "a", offset: 6 }]) }).state;
    expect(cmAnchorBlockIndex(state).get("a")).toBe(0);
    // Delete the first paragraph and its trailing blank line — the range strictly contains offset 6.
    state = state.update({ changes: { from: 0, to: 8 } }).state;
    // Dropped (orphaned), not collapsed to offset 0 — which would now mis-bind it to "Second.".
    expect(getCmAnchors(state)).toEqual([]);
    expect(cmAnchorBlockIndex(state).has("a")).toBe(false);
  });

  it("keeps the anchor when one line of a multi-line paragraph is deleted (margins-4)", () => {
    // A single block (no blank line) of three soft-wrapped lines; the anchor sits at the block end.
    const text = "Line one\nLine two\nLine three";
    const end = text.length;
    const twoLines = "Line one\nLine two".length;
    let state = make(text);
    state = state.update({
      effects: setCmAnchorsEffect.of([{ markerId: "a", offset: end }]),
    }).state;
    expect(cmAnchorBlockIndex(state).get("a")).toBe(0);
    // Delete the last line ("\nLine three") — the paragraph survives as "Line one\nLine two".
    state = state.update({ changes: { from: twoLines, to: end } }).state;
    // The anchor is NOT orphaned: it remaps into the surviving block, still bound to block 0.
    expect(getCmAnchors(state).length).toBe(1);
    expect(cmAnchorBlockIndex(state).get("a")).toBe(0);
  });

  it("orphans the anchor only when the whole multi-line paragraph is deleted (margins-4)", () => {
    const para = "Line one\nLine two\nLine three";
    let state = make(`${para}\n\nNext.`);
    state = state.update({
      effects: setCmAnchorsEffect.of([{ markerId: "a", offset: para.length }]),
    }).state;
    // Delete the entire paragraph and its blank-line separator → only "Next." remains.
    state = state.update({ changes: { from: 0, to: `${para}\n\n`.length } }).state;
    expect(getCmAnchors(state)).toEqual([]);
  });

  it("keeps an anchor when an earlier deletion does not touch its block", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "b", offset: 15 }]) }).state;
    // Delete 3 chars at the very start (does not contain offset 15); the anchor remaps and stays bound.
    state = state.update({ changes: { from: 0, to: 3 } }).state;
    expect(getCmAnchors(state)[0]!.offset).toBe(12);
    expect(cmAnchorBlockIndex(state).get("b")).toBe(1);
  });
});
