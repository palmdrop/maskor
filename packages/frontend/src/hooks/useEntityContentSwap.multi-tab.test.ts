import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Multi-tab swap hardening — Phase 1 reproduction (references/plans/multi-tab-swap-hardening.md).
//
// The stale-tab timeline: tab A loads a fragment at server version v1, tab B edits + saves (server
// advances to v2), then tab A — still holding v1 — flushes on hide / is re-opened. The write path
// and the recovery seed are the two places a stale tab can loop old content back over newer work.
// These pin today's behaviour; Phase 3 adds a baseline so recovery no longer *silently* clobbers
// (the conflict-aware tests live in useEntityContentSwap.test.ts). The write path stays a crash net
// — a genuinely-dirty buffer must still be mirrored — so its baseline-blindness is characterized,
// not removed.

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
};

type SwapReadEnvelope = {
  status: 200;
  data: { content: string | null; savedAt: string | null; baseHash?: string | null };
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

describe("useEntityContentSwap — multi-tab stale-tab timeline (Phase 1)", () => {
  it("page-hide flush mirrors the buffer even after the server advanced past it", () => {
    // Vector 1 (page-hide flush). Tab A loaded v1; another tab saved v2 so the server prop advances,
    // but tab A's buffer still holds v1 (a genuinely-dirty buffer that buffer-authority kept). The
    // flush writes whatever the buffer holds — it cannot tell "v1 is the user's edit" from "v1 is
    // stale". This is the crash-net behaviour we KEEP; Phase 3 makes RECOVERY of such a write safe.
    const { putMutate } = setupMocks(emptySwapQuery());

    const { rerender } = renderHook(
      (props: { currentValue: string; serverValue: string }) =>
        useEntityContentSwap({ ...baseProps, ...props }),
      { initialProps: { currentValue: "v1", serverValue: "v1" } },
    );

    // Server advanced to v2 elsewhere; this tab's buffer still holds v1 (no debounce fire yet).
    rerender({ currentValue: "v1", serverValue: "v2" });
    expect(putMutate).not.toHaveBeenCalled();

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(putMutate).toHaveBeenCalledTimes(1);
    expect(putMutate.mock.calls[0]?.[0]?.data?.content).toBe("v1");
  });

  it("offers recovery whenever the swap content differs from the current server (the loss vector)", async () => {
    // Vector 3 (recovery). Tab A's swap holds v1-based edits; meanwhile the server advanced to v2. On
    // reopen, recovery is offered purely because the swap content differs from the current server.
    // The shell then auto-applies it — over v2. A legacy swap (no baseline recorded) cannot tell a
    // single-tab crash from a stale multi-tab overwrite, which is exactly the gap Phase 3 closes.
    setupMocks(
      mountedQuery({
        status: 200,
        data: { content: "v1 with tab A edits", savedAt: "2026-07-04T10:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() =>
      useEntityContentSwap({
        ...baseProps,
        currentValue: "v2 newer server",
        serverValue: "v2 newer server",
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.recovery?.content).toBe("v1 with tab A edits");
  });
});
