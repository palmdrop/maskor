import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInvalidateSequences } from "../useInvalidateSequences";

const seedQuery = (queryClient: QueryClient, queryKey: readonly string[]) => {
  queryClient.setQueryData(queryKey, { seeded: true });
};

const isInvalidated = (queryClient: QueryClient, queryKey: readonly string[]): boolean =>
  queryClient.getQueryCache().find({ queryKey })!.state.isInvalidated;

describe("useInvalidateSequences", () => {
  it("invalidates every sequence query of the project and nothing else", async () => {
    const queryClient = new QueryClient();
    // The whole generated sequence-query family shares the URL prefix.
    const listKey = ["/projects/p1/sequences"] as const;
    const mainKey = ["/projects/p1/sequences/main"] as const;
    const sequenceKey = ["/projects/p1/sequences/s1"] as const;
    const contentsKey = ["/projects/p1/sequences/s1/contents"] as const;
    // Unrelated caches that must survive: the project's fragments, another
    // project's sequences, and a non-string-first key.
    const fragmentsKey = ["/projects/p1/fragments"] as const;
    const otherProjectKey = ["/projects/p2/sequences"] as const;
    for (const queryKey of [
      listKey,
      mainKey,
      sequenceKey,
      contentsKey,
      fragmentsKey,
      otherProjectKey,
    ]) {
      seedQuery(queryClient, queryKey);
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateSequences("p1"), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, mainKey)).toBe(true);
    expect(isInvalidated(queryClient, sequenceKey)).toBe(true);
    expect(isInvalidated(queryClient, contentsKey)).toBe(true);
    expect(isInvalidated(queryClient, fragmentsKey)).toBe(false);
    expect(isInvalidated(queryClient, otherProjectKey)).toBe(false);
  });
});
