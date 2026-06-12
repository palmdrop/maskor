import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { useOverviewInlineEditor } from "../useOverviewInlineEditor";
import { FRAGMENT_NAV_SAVE_FAILED_MESSAGE } from "@lib/commands/scopes/fragment-nav";
import type { FragmentEditorHandle } from "@components/fragments/fragment-editor";

const setup = (overrides?: { editableOrder?: string[]; spineContentReady?: boolean }) => {
  const selectFragment = vi.fn();
  const sidebarSelectFragment = vi.fn();
  const scrollToFragment = vi.fn();
  const result = renderHook(() =>
    useOverviewInlineEditor({
      editableOrder: overrides?.editableOrder ?? ["a", "b", "c"],
      selectFragment,
      sidebarSelectFragment,
      spineContentReady: overrides?.spineContentReady ?? true,
      scrollToFragment,
    }),
  );
  return { ...result, selectFragment, sidebarSelectFragment, scrollToFragment };
};

// Install a fake editor handle on the ref so the dirty-guard save path is drivable.
const installEditor = (
  ref: { current: FragmentEditorHandle | null },
  save: () => Promise<void>,
) => {
  ref.current = { save } as unknown as FragmentEditorHandle;
};

beforeEach(() => vi.clearAllMocks());

describe("useOverviewInlineEditor", () => {
  it("opens fresh: sets the editing target and moves the selection (no save)", () => {
    const { result, selectFragment } = setup();
    act(() => result.current.handleEdit("b"));
    expect(result.current.editingFragmentUuid).toBe("b");
    expect(selectFragment).toHaveBeenCalledWith("b");
  });

  it("derives Previous/Next from the editable order and the open fragment", () => {
    const { result } = setup();
    act(() => result.current.openEditor("b"));
    expect(result.current).toMatchObject({
      previousUuid: "a",
      nextUuid: "c",
      hasPrevious: true,
      hasNext: true,
    });

    act(() => result.current.openEditor("c"));
    expect(result.current).toMatchObject({ nextUuid: null, hasNext: false });
  });

  it("retargets while editing by saving the current fragment first, then switching", async () => {
    const { result, selectFragment } = setup();
    act(() => result.current.openEditor("a"));
    const save = vi.fn().mockResolvedValue(undefined);
    installEditor(result.current.editorRef, save);

    await act(async () => {
      result.current.handleEdit("c");
    });

    expect(save).toHaveBeenCalledOnce();
    expect(result.current.editingFragmentUuid).toBe("c");
    expect(selectFragment).toHaveBeenLastCalledWith("c");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("aborts the retarget and toasts when the save rejects (stays on the current fragment)", async () => {
    const { result } = setup();
    act(() => result.current.openEditor("a"));
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    installEditor(result.current.editorRef, save);

    await act(async () => {
      result.current.handleEdit("c");
    });

    expect(save).toHaveBeenCalledOnce();
    expect(result.current.editingFragmentUuid).toBe("a");
    expect(toastError).toHaveBeenCalledWith(FRAGMENT_NAV_SAVE_FAILED_MESSAGE);
  });

  it("reorder-select scrolls/selects via the sidebar when not editing", () => {
    const { result, sidebarSelectFragment } = setup();
    act(() => result.current.handleReorderSelect("b", { toggle: true }));
    expect(sidebarSelectFragment).toHaveBeenCalledWith("b", { toggle: true });
    expect(result.current.editingFragmentUuid).toBeNull();
  });

  it("reorder-select retargets the overlay when editing", () => {
    const { result, sidebarSelectFragment, selectFragment } = setup();
    act(() => result.current.openEditor("a"));
    act(() => result.current.handleReorderSelect("b"));
    expect(sidebarSelectFragment).not.toHaveBeenCalled();
    expect(result.current.editingFragmentUuid).toBe("b");
    expect(selectFragment).toHaveBeenLastCalledWith("b");
  });

  it("on close, scrolls the spine back to the top of the last-shown fragment", async () => {
    const { result, scrollToFragment } = setup({ spineContentReady: true });
    act(() => result.current.openEditor("b"));
    act(() => result.current.closeEditor());
    expect(result.current.editingFragmentUuid).toBeNull();
    await waitFor(() => expect(scrollToFragment).toHaveBeenCalledWith("b"));
  });

  it("defers the close scroll until the spine content is ready", async () => {
    const { result, rerender, scrollToFragment } = renderHookWithReady();
    act(() => result.current.openEditor("b"));
    act(() => result.current.closeEditor());
    // Spine not ready yet → no scroll.
    expect(scrollToFragment).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(scrollToFragment).toHaveBeenCalledWith("b"));
  });
});

// Local helper for the readiness-gating test: lets the test flip spineContentReady
// across a rerender while keeping the same hook instance.
const renderHookWithReady = () => {
  const selectFragment = vi.fn();
  const sidebarSelectFragment = vi.fn();
  const scrollToFragment = vi.fn();
  const utils = renderHook(
    ({ ready }: { ready: boolean }) =>
      useOverviewInlineEditor({
        editableOrder: ["a", "b", "c"],
        selectFragment,
        sidebarSelectFragment,
        spineContentReady: ready,
        scrollToFragment,
      }),
    { initialProps: { ready: false } },
  );
  return { ...utils, scrollToFragment };
};
