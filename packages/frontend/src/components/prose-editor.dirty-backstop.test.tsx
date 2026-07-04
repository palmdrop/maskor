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

  // Multi-tab swap hardening — Phase 1 disproof of the hypothesized backstop vector. The plan feared
  // a stale tab whose server prop advances (another tab saved) would have its OLD buffer marked dirty
  // by the backstop, then mirrored + save-enabled over the newer server content. In practice a CLEAN
  // buffer adopts the refetched server content (ProseEditor's content-sync effect runs while
  // !isDirty), so the backstop compares the buffer against the SAME advanced content and never fires.
  // The write-side stale vector therefore does not reproduce for a clean tab; recovery is the real
  // vector (see useEntityContentSwap.multi-tab.test.ts).
  it("does NOT dirty a clean buffer when the server content advances (buffer adopts it)", async () => {
    vi.useFakeTimers();
    const ref = createRef<ProseEditorHandle>();
    const onChange = vi.fn();
    const { rerender } = render(renderEditor(ref, "server v1", false, onChange));

    // Another tab saved: the server prop advances to v2 while this tab stays clean. The content-sync
    // effect adopts v2 into the buffer (buffer authority only protects a DIRTY buffer).
    rerender(renderEditor(ref, "server v2", false, onChange));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Buffer == advanced server content, so the backstop stays silent — no stale dirtying.
    expect(onChange).not.toHaveBeenCalled();
  });
});
