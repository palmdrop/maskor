import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { ProseEditor, type ProseEditorHandle } from "./prose-editor";

// Regression for the BIG ISSUE (specifications/fragment-editor.md, buffer authority): an unsaved
// (dirty) buffer must NOT be overwritten when the `content` prop changes underneath it — e.g. a
// background refetch after the same fragment was saved in another tab or edited in Obsidian. A clean
// buffer must still adopt incoming server content.

vi.mock("../lib/commands/useHandleCommandEvent", () => ({
  useHandleCommandEvent: () => () => null,
}));

const renderEditor = (
  ref: RefObject<ProseEditorHandle | null>,
  content: string,
  isDirty: boolean,
) => (
  <ProseEditor
    ref={ref}
    content={content}
    isDirty={isDirty}
    vimMode={false}
    rawMarkdownMode={false}
    fontSize={16}
    maxParagraphWidth={72}
    vimClipboardSync={false}
    onChange={vi.fn()}
  />
);

describe("ProseEditor — buffer authority while dirty", () => {
  it("does NOT overwrite unsaved edits when the content prop changes", async () => {
    const ref = createRef<ProseEditorHandle>();
    const { rerender } = render(renderEditor(ref, "server original", false));

    // User edits: buffer diverges and the editor is now dirty.
    await act(async () => {
      ref.current?.setContent("user unsaved edits");
    });

    // A background refetch delivers different server content while the buffer is dirty.
    await act(async () => {
      rerender(renderEditor(ref, "server updated elsewhere", true));
    });

    expect(ref.current?.getContent().trim()).toBe("user unsaved edits");
  });

  it("DOES adopt incoming server content when the buffer is clean", async () => {
    const ref = createRef<ProseEditorHandle>();
    const { rerender } = render(renderEditor(ref, "server original", false));

    await act(async () => {
      rerender(renderEditor(ref, "server updated elsewhere", false));
    });

    expect(ref.current?.getContent().trim()).toBe("server updated elsewhere");
  });
});
