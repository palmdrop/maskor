import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readOverviewSelection, writeOverviewSelection } from "@lib/nav-state";
import { useFragmentSelection } from "./useFragmentSelection";

vi.mock("@lib/nav-state", () => ({
  readOverviewSelection: vi.fn(() => []),
  writeOverviewSelection: vi.fn(),
}));

const readMock = vi.mocked(readOverviewSelection);
const writeMock = vi.mocked(writeOverviewSelection);

const PROJECT_ID = "p1";
const ORDER = ["a", "b", "c", "d"];
const fragmentByUuid = new Map(ORDER.map((uuid) => [uuid, { uuid }]));

const render = (overrides?: { visibleOrder?: string[]; summariesLoading?: boolean }) =>
  renderHook(() =>
    useFragmentSelection({
      projectId: PROJECT_ID,
      visibleOrder: overrides?.visibleOrder ?? ORDER,
      fragmentByUuid,
      summariesLoading: overrides?.summariesLoading ?? false,
    }),
  );

describe("useFragmentSelection", () => {
  beforeEach(() => {
    readMock.mockReturnValue([]);
    writeMock.mockClear();
  });

  it("single-selects a fragment", () => {
    const { result } = render();
    act(() => result.current.handleSelectFragment("b"));
    expect(result.current.selection).toEqual(["b"]);
    expect(result.current.primarySelectedUuid).toBe("b");
  });

  it("toggles fragments in and out of the selection", () => {
    const { result } = render();
    act(() => result.current.handleSelectFragment("a", { toggle: true }));
    act(() => result.current.handleSelectFragment("b", { toggle: true }));
    expect(result.current.selection).toEqual(["a", "b"]);

    act(() => result.current.handleSelectFragment("a", { toggle: true }));
    expect(result.current.selection).toEqual(["b"]);
  });

  it("shift-range selects forward from the anchor", () => {
    const { result } = render();
    act(() => result.current.handleSelectFragment("a"));
    act(() => result.current.handleSelectFragment("c", { range: true }));
    expect(result.current.selection).toEqual(["a", "b", "c"]);
  });

  it("shift-range selects backward from the anchor", () => {
    const { result } = render();
    act(() => result.current.handleSelectFragment("c"));
    act(() => result.current.handleSelectFragment("a", { range: true }));
    expect(result.current.selection).toEqual(["a", "b", "c"]);
  });

  it("clears the selection", () => {
    const { result } = render();
    act(() => result.current.handleSelectFragment("b"));
    act(() => result.current.clearSelection());
    expect(result.current.selection).toEqual([]);
    expect(result.current.primarySelectedUuid).toBeNull();
  });

  it("restores stored selection, filtered to still-existing fragments", () => {
    readMock.mockReturnValue(["a", "ghost", "c"]);
    const { result } = render();
    // "ghost" is not in fragmentByUuid → dropped.
    expect(result.current.selection).toEqual(["a", "c"]);
    expect(result.current.primarySelectedUuid).toBe("c");
  });

  it("does not persist before restore has run, then persists on change", () => {
    const { result } = render();
    // Nothing stored → restore is a no-op; the initial empty selection must not be written.
    expect(writeMock).not.toHaveBeenCalled();

    act(() => result.current.handleSelectFragment("b"));
    expect(writeMock).toHaveBeenCalledWith(PROJECT_ID, ["b"]);
  });

  it("waits for summaries before restoring", () => {
    readMock.mockReturnValue(["a"]);
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useFragmentSelection({
          projectId: PROJECT_ID,
          visibleOrder: ORDER,
          fragmentByUuid,
          summariesLoading: loading,
        }),
      { initialProps: { loading: true } },
    );
    expect(result.current.selection).toEqual([]);

    rerender({ loading: false });
    expect(result.current.selection).toEqual(["a"]);
  });
});
