import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const useListSwaps = vi.fn();

vi.mock("@api/generated/swap/swap", () => ({
  useListSwaps: (projectId: string, options?: unknown) => useListSwaps(projectId, options),
}));

import { useUnsavedFragmentUuids } from "./useUnsavedFragmentUuids";

beforeEach(() => {
  useListSwaps.mockReset();
});

describe("useUnsavedFragmentUuids", () => {
  it("returns only fragment swap UUIDs", () => {
    useListSwaps.mockReturnValue({
      data: {
        status: 200,
        data: {
          entries: [
            { entityType: "fragment", entityUUID: "frag-1", savedAt: "t" },
            { entityType: "aspect", entityUUID: "aspect-1", savedAt: "t" },
            { entityType: "fragment", entityUUID: "frag-2", savedAt: "t" },
          ],
        },
      },
    });

    const { result } = renderHook(() => useUnsavedFragmentUuids("project-1"));

    expect(result.current.has("frag-1")).toBe(true);
    expect(result.current.has("frag-2")).toBe(true);
    expect(result.current.has("aspect-1")).toBe(false);
    expect(result.current.size).toBe(2);
  });

  it("returns an empty set when the query has not resolved", () => {
    useListSwaps.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useUnsavedFragmentUuids("project-1"));

    expect(result.current.size).toBe(0);
  });
});
