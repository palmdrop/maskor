import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorState, type DecorationSet } from "@uiw/react-codemirror";
import { buildSharedProseExtensions } from "./shared-prose-extensions";
import { commentMarkerDecorations } from "./comment-marker-cm";

// --- TipTap (rich mode) round-trip ---

type MarkdownStorage = { markdown: { getMarkdown: () => string } };

const tiptapRoundTrip = (markdown: string): string => {
  const editor = new Editor({ extensions: buildSharedProseExtensions(), content: markdown });
  const out = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
  editor.destroy();
  return out;
};

describe("CommentMarker (TipTap) round-trip", () => {
  it("preserves a trailing marker through markdown -> ProseMirror -> markdown", () => {
    expect(tiptapRoundTrip("The bridge groans. <!--c:abc123-->")).toContain("<!--c:abc123-->");
  });

  it("preserves multiple markers", () => {
    const out = tiptapRoundTrip("One <!--c:aaa-->\n\nTwo <!--c:bbb-->");
    expect(out).toContain("<!--c:aaa-->");
    expect(out).toContain("<!--c:bbb-->");
  });

  it("leaves marker-free prose unchanged in substance", () => {
    expect(tiptapRoundTrip("Just plain prose.")).toContain("Just plain prose.");
  });
});

// --- CM6 (raw/vim mode) decorations ---

type Range = { from: number; to: number };

const decorationRanges = (set: DecorationSet): { lines: Range[]; replacements: Range[] } => {
  const lines: Range[] = [];
  const replacements: Range[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    // Line decorations are point decorations (from === to); replace decorations span the marker.
    if (cursor.from === cursor.to) lines.push({ from: cursor.from, to: cursor.to });
    else replacements.push({ from: cursor.from, to: cursor.to });
    cursor.next();
  }
  return { lines, replacements };
};

const decorate = (doc: string, cursor: number): DecorationSet =>
  commentMarkerDecorations(EditorState.create({ doc, selection: { anchor: cursor } }));

describe("commentMarkerDecorations (CM6)", () => {
  const doc = "first line\nsecond line <!--c:m1-->";
  // markers/line layout: line 1 = "first line" (0..10), line 2 starts at 11.
  const markerStart = 11 + "second line ".length;
  const markerEnd = markerStart + "<!--c:m1-->".length;

  it("hides the marker (zero-width replace) when the cursor is on another line", () => {
    const { lines, replacements } = decorationRanges(decorate(doc, 0));
    expect(replacements).toContainEqual({ from: markerStart, to: markerEnd });
    // The annotated line carries a cue decoration at its start.
    expect(lines).toContainEqual({ from: 11, to: 11 });
  });

  it("reveals the raw marker when the cursor is on its line", () => {
    const { lines, replacements } = decorationRanges(decorate(doc, markerStart));
    expect(replacements).toHaveLength(0);
    // The line cue stays even while revealed.
    expect(lines).toContainEqual({ from: 11, to: 11 });
  });

  it("adds no decorations to a marker-free document", () => {
    const { lines, replacements } = decorationRanges(decorate("plain prose only", 0));
    expect(lines).toHaveLength(0);
    expect(replacements).toHaveLength(0);
  });
});
