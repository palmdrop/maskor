import { describe, it, expect } from "vitest";
import { EditorState } from "@uiw/react-codemirror";
import { cmAnchorField, setCmAnchorsEffect } from "./anchor-cm";
import {
  buildHighlightDecorations,
  cmAnchorHighlightExtension,
  setHighlightedAnchorEffect,
} from "./anchor-highlight-cm";

const make = (doc: string) =>
  EditorState.create({ doc, extensions: [cmAnchorField, cmAnchorHighlightExtension] });

// Collect the line-start positions a decoration set covers, in order.
const decoratedLineStarts = (state: EditorState): number[] => {
  const set = buildHighlightDecorations(state);
  const starts: number[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    starts.push(cursor.from);
    cursor.next();
  }
  return starts;
};

describe("anchor highlight (reciprocal cue)", () => {
  it("highlights nothing when no anchor is highlighted", () => {
    const state = make("First.\n\nSecond.");
    expect(decoratedLineStarts(state)).toEqual([]);
  });

  it("highlights the line of the highlighted anchor's block", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "b", offset: 15 }]) }).state;
    state = state.update({ effects: setHighlightedAnchorEffect.of("b") }).state;
    // Block 1 ("Second.") starts at offset 8.
    expect(decoratedLineStarts(state)).toEqual([8]);
  });

  it("covers every line of a multi-line block", () => {
    // A block is a run of non-blank lines; "Line one\nLine two" is one block (offsets 0..17).
    let state = make("Line one\nLine two\n\nNext.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "a", offset: 17 }]) }).state;
    state = state.update({ effects: setHighlightedAnchorEffect.of("a") }).state;
    // Both lines of block 0 are decorated (line starts at 0 and at 9).
    expect(decoratedLineStarts(state)).toEqual([0, 9]);
  });

  it("highlights nothing when the highlighted marker has no live anchor", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "a", offset: 6 }]) }).state;
    state = state.update({ effects: setHighlightedAnchorEffect.of("missing") }).state;
    expect(decoratedLineStarts(state)).toEqual([]);
  });

  it("clears the highlight when set back to null", () => {
    let state = make("First.\n\nSecond.");
    state = state.update({ effects: setCmAnchorsEffect.of([{ markerId: "a", offset: 6 }]) }).state;
    state = state.update({ effects: setHighlightedAnchorEffect.of("a") }).state;
    expect(decoratedLineStarts(state)).toEqual([0]);
    state = state.update({ effects: setHighlightedAnchorEffect.of(null) }).state;
    expect(decoratedLineStarts(state)).toEqual([]);
  });
});
