import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOptimisticMutation } from "./useOptimisticMutation";

type Cache = { status: number; data: { value: number } };
type Variables = { delta: number };
type Response = { value: number };

const queryKey = ["thing"] as const;

const seed = (queryClient: QueryClient, value: number) => {
  queryClient.setQueryData<Cache>(queryKey, { status: 200, data: { value } });
};

const read = (queryClient: QueryClient) => queryClient.getQueryData<Cache>(queryKey)?.data.value;

// apply owns the envelope guard, mirroring how real reducers narrow the cache shape.
const apply = (previous: Cache | undefined, variables: Variables): Cache | undefined => {
  if (!previous || previous.status !== 200) return previous;
  return { ...previous, data: { value: previous.data.value + variables.delta } };
};

describe("useOptimisticMutation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const renderMutation = (
    mutationFn: (variables: Variables) => Promise<Response>,
    config: Partial<Parameters<typeof useOptimisticMutation<Cache, Variables, Response>>[0]> = {},
  ) =>
    renderHook(
      () =>
        useMutation({
          mutationFn,
          ...useOptimisticMutation<Cache, Variables, Response>({ queryKey, apply, ...config }),
        }),
      { wrapper },
    );

  it("applies the reducer optimistically on mutate, before the request resolves", async () => {
    seed(queryClient, 1);
    let resolve!: (response: Response) => void;
    const mutationFn = vi.fn(() => new Promise<Response>((r) => (resolve = r)));

    const { result } = renderMutation(mutationFn);

    act(() => {
      result.current.mutate({ delta: 5 });
    });

    // Optimistic value is visible while the request is still in flight.
    await waitFor(() => expect(read(queryClient)).toBe(6));

    await act(async () => {
      resolve({ value: 99 });
    });
  });

  it("rolls back to the snapshot when the request rejects", async () => {
    seed(queryClient, 10);
    const mutationFn = vi.fn(() => Promise.reject(new Error("boom")));

    const { result } = renderMutation(mutationFn);

    await act(async () => {
      await result.current.mutateAsync({ delta: 7 }).catch(() => {});
    });

    await waitFor(() => expect(read(queryClient)).toBe(10));
  });

  it("reconciles the server response into the target on success when reconcile is given", async () => {
    seed(queryClient, 1);
    const mutationFn = vi.fn(() => Promise.resolve<Response>({ value: 42 }));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderMutation(mutationFn, {
      reconcile: (previous, response) =>
        previous ? { ...previous, data: { value: response.value } } : previous,
    });

    await act(async () => {
      await result.current.mutateAsync({ delta: 5 });
    });

    expect(read(queryClient)).toBe(42);
    // reconcile path must not invalidate the target.
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey }));
  });

  it("invalidates the target on success when no reconcile is given", async () => {
    seed(queryClient, 1);
    const mutationFn = vi.fn(() => Promise.resolve<Response>({ value: 42 }));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderMutation(mutationFn);

    await act(async () => {
      await result.current.mutateAsync({ delta: 5 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
  });

  it("invalidates every extra invalidate[] key on success", async () => {
    seed(queryClient, 1);
    const mutationFn = vi.fn(() => Promise.resolve<Response>({ value: 42 }));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const otherKey = ["other"] as const;

    const { result } = renderMutation(mutationFn, {
      reconcile: (previous) => previous,
      invalidate: [[...otherKey]],
    });

    await act(async () => {
      await result.current.mutateAsync({ delta: 5 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...otherKey] });
  });

  it("invalidates settleInvalidate[] keys on success", async () => {
    seed(queryClient, 1);
    const mutationFn = vi.fn(() => Promise.resolve<Response>({ value: 42 }));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderMutation(mutationFn, { settleInvalidate: [["action-log"]] });

    await act(async () => {
      await result.current.mutateAsync({ delta: 5 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["action-log"] });
  });

  it("invalidates settleInvalidate[] keys on error too", async () => {
    seed(queryClient, 10);
    const mutationFn = vi.fn(() => Promise.reject(new Error("boom")));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderMutation(mutationFn, { settleInvalidate: [["action-log"]] });

    await act(async () => {
      await result.current.mutateAsync({ delta: 5 }).catch(() => {});
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["action-log"] });
  });
});
