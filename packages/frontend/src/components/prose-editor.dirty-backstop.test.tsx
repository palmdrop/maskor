import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { ProseEditor, type ProseEditorHandle } from "./prose-editor";

// Regression for the data-loss incident (never-lose-writing, Phase 2): the change chain
// (onUpdate → onChange) is the single source of truth for "the buffer is dirty". If it ever misses
// an edit, the host stays clean while the buffer holds unsaved work and every protection (save,
// swap, buffer authority) disengages. A heartbeat re-derives dirtiness by comparing the live buffer
// against the server content, and fires onChange to re-engage the protections.

vi.mock("../lib/commands/useHandleCommandEvent", () => ({
  useHandleCommandEvent: () => () => null,
}));

const renderEditor = (
  ref: RefObject<ProseEditorHandle | null>,
  content: string,
  isDirty: boolean,
  onChange: () => void,
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
    onChange={onChange}
  />
);

afterEach(() => {
  vi.useRealTimers();
});

describe("ProseEditor — dirty backstop", () => {
  it("fires onChange when the buffer diverges from server but the host thinks it is clean", async () => {
    vi.useFakeTimers();
    const ref = createRef<ProseEditorHandle>();
    const onChange = vi.fn();
    render(renderEditor(ref, "server original", false, onChange));

    // Simulate a MISSED edit: setContent loads divergent text without emitting onUpdate
    // (emitUpdate:false), exactly the silent state the incident produced — buffer changed, host
    // still isDirty:false, onChange never fired.
    act(() => {
      ref.current?.setContent("user unsaved edits the host never heard about");
    });
    expect(onChange).not.toHaveBeenCalled();

    // The heartbeat catches the divergence and re-engages the change chain.
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("does NOT fire when the buffer matches the server content (clean fragment)", async () => {
    vi.useFakeTimers();
    const ref = createRef<ProseEditorHandle>();
    const onChange = vi.fn();
    render(renderEditor(ref, "server original", false, onChange));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT serialize/fire while the host already knows the buffer is dirty", async () => {
    vi.useFakeTimers();
    const ref = createRef<ProseEditorHandle>();
    const onChange = vi.fn();
    // Host already dirty: the normal path is alive, the backstop must stay out of the way.
    render(renderEditor(ref, "server original", true, onChange));

    act(() => {
      ref.current?.setContent("divergent buffer");
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
