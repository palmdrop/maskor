import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const useGetSwapMock = vi.fn();
const usePutSwapMock = vi.fn();
const useDeleteSwapMock = vi.fn();

vi.mock("@api/generated/swap/swap", () => ({
  useGetSwap: (...args: unknown[]) => useGetSwapMock(...args),
  usePutSwap: (...args: unknown[]) => usePutSwapMock(...args),
  useDeleteSwap: (...args: unknown[]) => useDeleteSwapMock(...args),
}));

import { useEntityContentSwap } from "./useEntityContentSwap";
import { ApiRequestError } from "../api/errors";

const baseProps = {
  projectId: "project-1",
  entityType: "fragment" as const,
  entityUUID: "uuid-1",
  serverValue: "server content",
  currentValue: "server content",
};

const mountedQuery = (
  data: { status: 200; data: { content: string; savedAt: string } } | undefined,
  error: unknown = null,
) => ({
  data,
  error,
  isLoading: false,
  isFetching: false,
});

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

  it("does not expose recovery when the swap read 404s", async () => {
    setupMocks(mountedQuery(undefined, new ApiRequestError(404, { error: "NOT_FOUND" })));

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.recovery).toBeNull();
  });
});

describe("useEntityContentSwap — debounced writes", () => {
  it("writes after the debounce window when currentValue diverges from serverValue", async () => {
    const { putMutate } = setupMocks(mountedQuery(undefined, new ApiRequestError(404, {})));

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
    const { putMutate } = setupMocks(mountedQuery(undefined, new ApiRequestError(404, {})));

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
    expect(putMutate.mock.calls[0]?.[0]?.data).toEqual({ content: "abc" });
  });

  it("does not write when currentValue matches serverValue", async () => {
    const { putMutate } = setupMocks(mountedQuery(undefined, new ApiRequestError(404, {})));

    renderHook(() => useEntityContentSwap(baseProps));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).not.toHaveBeenCalled();
  });

  it("does not throw when PUT fails", async () => {
    const putMutate = vi.fn(
      (
        _vars: unknown,
        opts?: { onError?: (error: unknown) => void; onSuccess?: () => void },
      ) => {
        opts?.onError?.(new Error("network down"));
      },
    );
    setupMocks(mountedQuery(undefined, new ApiRequestError(404, {})), putMutate);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rerender } = renderHook(
      ({ currentValue }: { currentValue: string }) =>
        useEntityContentSwap({ ...baseProps, currentValue }),
      { initialProps: { currentValue: "server content" } },
    );

    rerender({ currentValue: "draft" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(putMutate).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Subsequent failures within the same session do not re-warn.
    rerender({ currentValue: "draft 2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
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

  it("clear() does not throw if DELETE rejects", async () => {
    const deleteMutateAsync = vi.fn().mockRejectedValue(new Error("boom"));
    setupMocks(mountedQuery(undefined, new ApiRequestError(404, {})), undefined, deleteMutateAsync);

    const { result } = renderHook(() => useEntityContentSwap(baseProps));

    await expect(
      act(async () => {
        await result.current.clear();
      }),
    ).resolves.not.toThrow();
  });
});
