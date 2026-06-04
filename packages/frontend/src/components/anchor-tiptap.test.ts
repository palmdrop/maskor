import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildSharedProseExtensions } from "./shared-prose-extensions";
import {
  tiptapAnchorExtension,
  tiptapAnchorKey,
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

  it("drops an anchor when its block is deleted, not mis-binding to the neighbour (margins-4 #7)", () => {
    const editor = makeEditor("Alpha.\n\nBeta. <!--c:b-->");
    extractTiptapAnchors(editor);
    expect(tiptapAnchorBlockIndex(editor.state).get("b")).toBe(1);
    // Delete the second paragraph (the block carrying the anchor).
    let from = 0;
    let to = 0;
    editor.state.doc.forEach((node, offset, index) => {
      if (index === 1) {
        from = offset;
        to = offset + node.nodeSize;
      }
    });
    editor.view.dispatch(editor.state.tr.delete(from, to));
    // The anchor is dropped (orphaned), not collapsed onto "Alpha." (block 0).
    expect(tiptapAnchorBlockIndex(editor.state).has("b")).toBe(false);
    expect(serializeTiptapWithMarkers(editor)).not.toContain("<!--c:b-->");
    editor.destroy();
  });

  it("keeps the anchor when text is deleted before it within the same paragraph (margins-4)", () => {
    const editor = makeEditor("Hello world. <!--c:b-->");
    extractTiptapAnchors(editor);
    expect(tiptapAnchorBlockIndex(editor.state).get("b")).toBe(0);
    // Delete the four characters immediately before the anchor — the paragraph (and the anchor at its
    // end) survive, so the anchor is NOT orphaned (only `deletedAcross` whole-block deletes drop it).
    const anchorPos = (tiptapAnchorKey.getState(editor.state) ?? [])[0]!.pos;
    editor.view.dispatch(editor.state.tr.delete(anchorPos - 4, anchorPos));
    expect(tiptapAnchorBlockIndex(editor.state).get("b")).toBe(0);
    expect(serializeTiptapWithMarkers(editor)).toContain("<!--c:b-->");
    editor.destroy();
  });
});
