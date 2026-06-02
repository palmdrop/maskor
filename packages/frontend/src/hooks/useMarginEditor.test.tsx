import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Margin } from "@api/generated/maskorAPI.schemas";

const writeMarginMock = vi.fn();
let marginQueryResult: {
  data?: { status: number; data?: Margin };
  isLoading: boolean;
  isFetching: boolean;
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@api/generated/margins/margins", () => ({
  useGetMargin: () => marginQueryResult,
  useWriteMargin: () => ({ mutateAsync: writeMarginMock, isPending: false }),
  getGetMarginQueryKey: () => ["margin"],
  getListOrphanedCommentsQueryKey: () => ["orphaned"],
}));

import { useMarginEditor } from "./useMarginEditor";

const serverMargin = (overrides: Partial<Margin> = {}): Margin => ({
  fragmentUuid: "f1",
  fragmentKey: "frag",
  notes: "server notes",
  comments: [{ markerId: "a", excerpt: "ex-a", body: "body-a" }],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  writeMarginMock.mockReset();
  writeMarginMock.mockResolvedValue({ status: 200 });
  marginQueryResult = { isLoading: false, isFetching: false };
});

describe("useMarginEditor", () => {
  it("treats a 404 (no margin yet) as an empty, non-existent margin", () => {
    marginQueryResult = { data: { status: 404 }, isLoading: false, isFetching: false };
    const { result } = renderHook(() => useMarginEditor("p", "f1"));
    expect(result.current.exists).toBe(false);
    expect(result.current.notes).toBe("");
    expect(result.current.comments).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("seeds from the server margin and becomes dirty on local edits", () => {
    marginQueryResult = {
      data: { status: 200, data: serverMargin() },
      isLoading: false,
      isFetching: false,
    };
    const { result } = renderHook(() => useMarginEditor("p", "f1"));
    expect(result.current.notes).toBe("server notes");
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setNotes("edited notes"));
    expect(result.current.notes).toBe("edited notes");
    expect(result.current.isDirty).toBe(true);
  });

  it("adds a comment stub idempotently per marker", () => {
    marginQueryResult = {
      data: { status: 200, data: serverMargin() },
      isLoading: false,
      isFetching: false,
    };
    const { result } = renderHook(() => useMarginEditor("p", "f1"));

    act(() => result.current.addCommentStub({ markerId: "b", excerpt: "ex-b", body: "" }));
    expect(result.current.comments.map((c) => c.markerId)).toEqual(["a", "b"]);

    // Re-running the gesture on the same marker reseeds the excerpt, never duplicates.
    act(() => result.current.addCommentStub({ markerId: "b", excerpt: "ex-b2", body: "ignored" }));
    expect(result.current.comments.filter((c) => c.markerId === "b")).toHaveLength(1);
    expect(result.current.comments.find((c) => c.markerId === "b")?.excerpt).toBe("ex-b2");
  });

  it("removes a comment and persists the whole margin on save", async () => {
    marginQueryResult = {
      data: { status: 200, data: serverMargin() },
      isLoading: false,
      isFetching: false,
    };
    const { result } = renderHook(() => useMarginEditor("p", "f1"));

    act(() => result.current.removeComment("a"));
    expect(result.current.comments).toEqual([]);
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });
    expect(writeMarginMock).toHaveBeenCalledWith({
      projectId: "p",
      fragmentId: "f1",
      data: { notes: "server notes", comments: [] },
    });
    // After save the local state is the new clean baseline.
    expect(result.current.isDirty).toBe(false);
  });

  it("round-trips through serialize/applySerialized for the swap mirror", () => {
    marginQueryResult = {
      data: { status: 200, data: serverMargin() },
      isLoading: false,
      isFetching: false,
    };
    const { result } = renderHook(() => useMarginEditor("p", "f1"));

    act(() => result.current.setNotes("swapped notes"));
    const raw = result.current.serialize();

    act(() => result.current.revertToServer());
    expect(result.current.notes).toBe("server notes");

    act(() => result.current.applySerialized(raw));
    expect(result.current.notes).toBe("swapped notes");
  });
});
