import { describe, it, expect, vi, afterEach } from "vitest";
import { EditorView } from "@uiw/react-codemirror";
import { cmAnchorExtension } from "./anchor-cm";
import { cmAnchorHighlightExtension } from "./anchor-highlight-cm";
import { createCodeMirrorProseAdapter } from "./prose-editor-cm-adapter";

const views: EditorView[] = [];

const makeView = (doc: string): EditorView => {
  const view = new EditorView({
    doc,
    extensions: [cmAnchorExtension, cmAnchorHighlightExtension],
  });
  views.push(view);
  return view;
};

const makeAdapter = (view: EditorView | null) => {
  const notifyChange = vi.fn();
  const setCmValue = vi.fn();
  const adapter = createCodeMirrorProseAdapter({
    getView: () => view,
    getFallbackContent: () => "FALLBACK",
    setCmValue,
    notifyChange,
  });
  return { adapter, notifyChange, setCmValue };
};

afterEach(() => {
  while (views.length) views.pop()!.destroy();
});

describe("createCodeMirrorProseAdapter", () => {
  it("returns the fallback content when no view exists", () => {
    const { adapter } = makeAdapter(null);
    expect(adapter.getContent()).toBe("FALLBACK");
  });

  it("round-trips comment markers: setContent strips them from the buffer, getContent re-emits", () => {
    const view = makeView("");
    const { adapter, setCmValue } = makeAdapter(view);

    adapter.setContent("First paragraph. <!--c:abc-->\n\nSecond paragraph.");

    // The live buffer is clean markdown — no marker text.
    expect(view.state.doc.toString()).toBe("First paragraph. \n\nSecond paragraph.");
    expect(setCmValue).toHaveBeenCalledWith("First paragraph. \n\nSecond paragraph.");

    // On the way out, the anchor re-emits as a marker at its mapped offset.
    expect(adapter.getContent()).toContain("<!--c:abc-->");
  });

  it("captures the trimmed selection text", () => {
    const view = makeView("hello world");
    const { adapter } = makeAdapter(view);

    view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(adapter.getSelection()).toEqual({ text: "hello", isEmpty: false });

    view.dispatch({ selection: { anchor: 3, head: 3 } });
    expect(adapter.getSelection()).toEqual({ text: "", isEmpty: true });
  });

  it("adds an anchor at a block and re-emits it; removeAnchor drops it", () => {
    const view = makeView("Alpha\n\nBeta");
    const { adapter, notifyChange } = makeAdapter(view);

    adapter.addAnchorAtBlock(0, "m1");
    expect(notifyChange).toHaveBeenCalledTimes(1);
    expect(adapter.getContent()).toContain("<!--c:m1-->");

    adapter.removeAnchor("m1");
    expect(notifyChange).toHaveBeenCalledTimes(2);
    expect(adapter.getContent()).not.toContain("<!--c:m1-->");
  });

  it("reports the current block's anchor and index", () => {
    const view = makeView("Alpha\n\nBeta");
    const { adapter } = makeAdapter(view);
    adapter.addAnchorAtBlock(1, "m2");

    // Caret in the second block.
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const block = adapter.getCurrentBlock();
    expect(block?.index).toBe(1);
    expect(block?.markerId).toBe("m2");
    expect(block?.text).toBe("Beta");
  });

  it("enumerates blocks (one entry per paragraph)", () => {
    const view = makeView("One\n\nTwo\n\nThree");
    const { adapter } = makeAdapter(view);
    expect(adapter.getBlocks().length).toBe(3);
  });

  it("no-ops the anchor operations when no view exists", () => {
    const { adapter, notifyChange } = makeAdapter(null);
    adapter.addAnchorAtBlock(0, "x");
    adapter.removeAnchor("x");
    expect(notifyChange).not.toHaveBeenCalled();
    expect(adapter.getBlocks()).toEqual([]);
    expect(adapter.getScrollElement()).toBeNull();
    expect(adapter.getCurrentBlock()).toBeNull();
  });
});
