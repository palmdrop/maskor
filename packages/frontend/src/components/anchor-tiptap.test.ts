import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildSharedProseExtensions } from "./shared-prose-extensions";
import {
  tiptapAnchorExtension,
  extractTiptapAnchors,
  serializeTiptapWithMarkers,
  tiptapAnchorBlockIndex,
} from "./anchor-tiptap";

type MarkdownStorage = { markdown: { getMarkdown: () => string } };

const makeEditor = (content: string): Editor =>
  new Editor({ extensions: [...buildSharedProseExtensions(), tiptapAnchorExtension], content });

const getMarkdown = (editor: Editor): string =>
  (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();

describe("tiptap anchors (ADR 0009)", () => {
  it("strips markers into anchors on load, leaving a clean buffer, and re-emits them", () => {
    const editor = makeEditor("First. <!--c:a-->\n\nSecond.");
    extractTiptapAnchors(editor);
    // The live buffer no longer carries the marker...
    expect(getMarkdown(editor)).not.toContain("<!--c:a-->");
    // ...but it is re-emitted on the save path.
    expect(serializeTiptapWithMarkers(editor)).toContain("<!--c:a-->");
    editor.destroy();
  });

  it("binds the anchor to its block", () => {
    const editor = makeEditor("Alpha.\n\nBeta. <!--c:b-->");
    extractTiptapAnchors(editor);
    expect(tiptapAnchorBlockIndex(editor.state).get("b")).toBe(1);
    editor.destroy();
  });

  it("carries the anchor through an edit in an earlier block (position mapping)", () => {
    const editor = makeEditor("Alpha.\n\nBeta. <!--c:b-->");
    extractTiptapAnchors(editor);
    // Insert text inside the first block; the anchor on block 1 must map forward and stay on block 1.
    editor.view.dispatch(editor.state.tr.insertText("X", 1));
    expect(tiptapAnchorBlockIndex(editor.state).get("b")).toBe(1);
    expect(serializeTiptapWithMarkers(editor)).toContain("<!--c:b-->");
    editor.destroy();
  });

  it("re-emits nothing for content that had no markers", () => {
    const editor = makeEditor("Just prose.\n\nMore prose.");
    extractTiptapAnchors(editor);
    expect(serializeTiptapWithMarkers(editor)).not.toContain("<!--c:");
    editor.destroy();
  });
});
