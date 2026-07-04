import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const useGetSwapMock = vi.fn();
const usePutSwapMock = vi.fn();
const useDeleteSwapMock = vi.fn();

vi.mock("@api/generated/swap/swap", () => ({
  useGetSwap: (...args: unknown[]) => useGetSwapMock(...args),
  usePutSwap: (...args: unknown[]) => usePutSwapMock(...args),
  useDeleteSwap: (...args: unknown[]) => useDeleteSwapMock(...args),
  getListSwapsQueryKey: (projectId: string) => ["listSwaps", projectId],
}));

const invalidateQueriesMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

import { useEntityContentSwap } from "./useEntityContentSwap";

const baseProps = {
  projectId: "project-1",
  entityType: "fragment" as const,
  entityUUID: "uuid-1",
  serverValue: "server content",
  currentValue: "server content",
};

type SwapReadEnvelope = {
  status: 200;
  data: { content: string | null; savedAt: string | null };
};

const mountedQuery = (data: SwapReadEnvelope | undefined, error: unknown = null) => ({
  data,
  error,
  isLoading: false,
  isFetching: false,
});

const emptySwapQuery = () => mountedQuery({ status: 200, data: { content: null, savedAt: null } });

const setupMocks = (
  query: ReturnType<typeof mountedQuery>,
  putMutate: ReturnType<typeof vi.fn> = vi.fn(),
  deleteMutateAsync: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
) => {
  useGetSwapMock.mockReturnValue(query);
  usePutSwapMock.mockReturnValue({ mutate: putMutate });
  useDeleteSwapMock.mockReturnValue({ mutateAsync: deleteMutateAsync });
  return { putMutate, deleteMutateAsync };
};

beforeEach(() => {
  vi.useFakeTimers();
  useGetSwapMock.mockReset();
  usePutSwapMock.mockReset();
  useDeleteSwapMock.mockReset();
  invalidateQueriesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEntityContentSwap — mount-time recovery", () => {
  it("exposes recovery when cached content differs from serverValue", async () => {
    setupMocks(
      mountedQuery({
        status: 200,
        data: { content: "cached body", savedAt: "2026-05-19T10:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.recovery?.content).toBe("cached body");
    expect(result.current.recovery?.at.toISOString()).toBe("2026-05-19T10:00:00.000Z");
  });

  it("does not expose recovery when cached content matches serverValue", async () => {
    setupMocks(
      mountedQuery({
        status: 200,
        data: { content: "server content", savedAt: "2026-05-19T10:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recovery).toBeNull();
  });

  it("does not expose recovery when no swap file exists (null content)", async () => {
    setupMocks(emptySwapQuery());

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recovery).toBeNull();
  });
});

describe("useEntityContentSwap — debounced writes", () => {
  it("writes after the debounce window when currentValue diverges from serverValue", async () => {
    const { putMutate } = setupMocks(emptySwapQuery());

    const { rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "draft body" });
    expect(putMutate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).toHaveBeenCalledTimes(1);
    expect(putMutate.mock.calls[0]?.[0]).toMatchObject({
      projectId: "project-1",
      entityType: "fragment",
      entityUUID: "uuid-1",
      data: { content: "draft body" },
    });
  });

  it("collapses rapid changes into a single PUT with the latest value", async () => {
    const { putMutate } = setupMocks(emptySwapQuery());

    const { rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "a" });
    rerender({ currentValue: "ab" });
    rerender({ currentValue: "abc" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).toHaveBeenCalledTimes(1);
    // The write also carries a baseline fingerprint of the server content (multi-tab-swap-hardening).
    expect(putMutate.mock.calls[0]?.[0]?.data).toMatchObject({ content: "abc" });
    expect(putMutate.mock.calls[0]?.[0]?.data?.baseHash).toEqual(expect.any(String));
  });

  it("does not write when currentValue matches serverValue", async () => {
    const { putMutate } = setupMocks(emptySwapQuery());

    renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).not.toHaveBeenCalled();
  });

  it("does not throw when PUT fails, and surfaces backupFailed", async () => {
    const putMutate = vi.fn(
      (_vars: unknown, opts?: { onError?: (error: unknown) => void; onSuccess?: () => void }) => {
        opts?.onError?.(new Error("network down"));
      },
    );
    setupMocks(emptySwapQuery(), putMutate);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    expect(result.current.backupFailed).toBe(false);

    rerender({ currentValue: "draft" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).toHaveBeenCalled();
    // The crash net is failing — the user must be told.
    expect(result.current.backupFailed).toBe(true);

    warnSpy.mockRestore();
  });

  it("clears backupFailed once a later write succeeds", async () => {
    // First write fails, later writes succeed.
    let shouldFail = true;
    const putMutate = vi.fn(
      (_vars: unknown, opts?: { onError?: (error: unknown) => void; onSuccess?: () => void }) => {
        if (shouldFail) opts?.onError?.(new Error("network down"));
        else opts?.onSuccess?.();
      },
    );
    setupMocks(emptySwapQuery(), putMutate);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "draft" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.backupFailed).toBe(true);

    shouldFail = false;
    rerender({ currentValue: "draft recovered" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.backupFailed).toBe(false);

    warnSpy.mockRestore();
  });
});

describe("useEntityContentSwap — page-hide flush", () => {
  it("flushes the pending buffer immediately on visibilitychange → hidden", async () => {
    const { putMutate } = setupMocks(emptySwapQuery());

    const { rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    // Edit, but DON'T let the 150ms debounce fire — the work is still only in memory.
    rerender({ currentValue: "draft not yet flushed" });
    expect(putMutate).not.toHaveBeenCalled();

    // Page is being hidden (tab close / switch away): flush now.
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(putMutate).toHaveBeenCalledTimes(1);
    expect(putMutate.mock.calls[0]?.[0]?.data).toMatchObject({ content: "draft not yet flushed" });
  });

  it("does not flush when the buffer matches the server content", async () => {
    const { putMutate } = setupMocks(emptySwapQuery());

    renderHook(() => useEntityContentSwap(baseProps));

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(putMutate).not.toHaveBeenCalled();
  });
});

describe("useEntityContentSwap — clear()", () => {
  it("fires DELETE and clears recovery", async () => {
    const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
    setupMocks(
      mountedQuery({
        status: 200,
        data: { content: "cached body", savedAt: "2026-05-19T10:00:00.000Z" },
      }),
      undefined,
      deleteMutateAsync,
    );

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recovery).not.toBeNull();

    await act(async () => {
      await result.current.clear();
    });

    expect(deleteMutateAsync).toHaveBeenCalledTimes(1);
    expect(deleteMutateAsync.mock.calls[0]?.[0]).toEqual({
      projectId: "project-1",
      entityType: "fragment",
      entityUUID: "uuid-1",
    });
    expect(result.current.recovery).toBeNull();
  });

  it("clears backupFailed (a successful save means there is nothing left to back up)", async () => {
    // A failing PUT raises the banner; clear() (run on a successful canonical save) must lower it —
    // otherwise the "not backed up" warning sticks as a false alarm after the work is safe.
    const putMutate = vi.fn((_vars: unknown, opts?: { onError?: (error: unknown) => void }) => {
      opts?.onError?.(new Error("network down"));
    });
    const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
    setupMocks(emptySwapQuery(), putMutate, deleteMutateAsync);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "draft" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.backupFailed).toBe(true);

    await act(async () => {
      await result.current.clear();
    });
    expect(result.current.backupFailed).toBe(false);

    warnSpy.mockRestore();
  });

  it("clear() does not throw if DELETE rejects", async () => {
    const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("boom"));
    setupMocks(emptySwapQuery(), undefined, deleteMutateAsync);

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await expect(
      act(async () => {
        await result.current.clear();
      }),
    ).resolves.not.toThrow();
  });
});

describe("useEntityContentSwap — swap-list refresh (unsaved-changes dot)", () => {
  it("refreshes the swap list once when the first write creates the swap", async () => {
    const putMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    setupMocks(emptySwapQuery(), putMutate);

    const { rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "draft body" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesMock.mock.calls[0]?.[0]).toEqual({
      queryKey: ["listSwaps", "project-1"],
    });

    // A second write to the same (now-present) swap does not re-fetch the list.
    rerender({ currentValue: "draft body 2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the swap list when clear() removes an existing swap", async () => {
    setupMocks(
      mountedQuery({
        status: 200,
        data: { content: "cached body", savedAt: "2026-05-19T10:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() => useEntityContentSwap(baseProps));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesMock.mock.calls[0]?.[0]).toEqual({
      queryKey: ["listSwaps", "project-1"],
    });
  });

  it("does not refresh the swap list when clear() finds no swap present", async () => {
    setupMocks(emptySwapQuery());

    const { result } = renderHook(() => useEntityContentSwap(baseProps));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
