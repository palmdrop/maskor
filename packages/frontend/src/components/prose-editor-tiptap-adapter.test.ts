import { describe, it, expect, vi, afterEach } from "vitest";
import { Editor } from "@tiptap/react";
import { buildSharedProseExtensions } from "./shared-prose-extensions";
import { tiptapAnchorExtension } from "./anchor-tiptap";
import { createTiptapProseAdapter } from "./prose-editor-tiptap-adapter";

const editors: Editor[] = [];

const makeEditor = (content = ""): Editor => {
  const editor = new Editor({
    extensions: [...buildSharedProseExtensions(), tiptapAnchorExtension],
    content,
  });
  editors.push(editor);
  return editor;
};

const makeAdapter = (editor: Editor | null) => {
  const notifyChange = vi.fn();
  const setLoading = vi.fn();
  const adapter = createTiptapProseAdapter({
    getEditor: () => editor,
    getFallbackContent: () => "FALLBACK",
    getScroller: () => null,
    setLoading,
    notifyChange,
  });
  return { adapter, notifyChange, setLoading };
};

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

describe("createTiptapProseAdapter", () => {
  it("returns the fallback content when no editor exists", () => {
    const { adapter } = makeAdapter(null);
    expect(adapter.getContent()).toBe("FALLBACK");
  });

  it("round-trips comment markers: setContent loads them as anchors, getContent re-emits", () => {
    const editor = makeEditor();
    const { adapter, setLoading } = makeAdapter(editor);

    adapter.setContent("First paragraph. <!--c:abc-->\n\nSecond paragraph.");
    // The load transaction is guarded so it doesn't dirty the buffer.
    expect(setLoading).toHaveBeenCalledWith(true);
    expect(setLoading).toHaveBeenCalledWith(false);

    expect(adapter.getContent()).toContain("<!--c:abc-->");
  });

  it("captures the trimmed selection text", () => {
    const editor = makeEditor("hello world");
    const { adapter } = makeAdapter(editor);

    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(adapter.getSelection()).toEqual({ text: "hello", isEmpty: false });

    editor.commands.setTextSelection({ from: 3, to: 3 });
    expect(adapter.getSelection()).toEqual({ text: "", isEmpty: true });
  });

  it("adds an anchor at a block and re-emits it; removeAnchor drops it", () => {
    const editor = makeEditor("Alpha\n\nBeta");
    const { adapter, notifyChange } = makeAdapter(editor);

    adapter.addAnchorAtBlock(0, "m1");
    expect(notifyChange).toHaveBeenCalledTimes(1);
    expect(adapter.getContent()).toContain("<!--c:m1-->");

    adapter.removeAnchor("m1");
    expect(notifyChange).toHaveBeenCalledTimes(2);
    expect(adapter.getContent()).not.toContain("<!--c:m1-->");
  });

  it("enumerates blocks (one entry per paragraph)", () => {
    const editor = makeEditor("One\n\nTwo\n\nThree");
    const { adapter } = makeAdapter(editor);
    expect(adapter.getBlocks().length).toBe(3);
  });

  it("no-ops the anchor operations when no editor exists", () => {
    const { adapter, notifyChange } = makeAdapter(null);
    adapter.addAnchorAtBlock(0, "x");
    adapter.removeAnchor("x");
    expect(notifyChange).not.toHaveBeenCalled();
    expect(adapter.getBlocks()).toEqual([]);
    expect(adapter.getCurrentBlock()).toBeNull();
  });

  it("setHighlightedAnchor is a no-op in rich mode", () => {
    const editor = makeEditor("Alpha");
    const { adapter } = makeAdapter(editor);
    expect(() => adapter.setHighlightedAnchor("m1")).not.toThrow();
  });
});
