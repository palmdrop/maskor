import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// EntityEditorShell has heavy dependencies (ProseEditor + TipTap, project config hook).
// For this test we only care about the sidebar wiring and isPending propagation —
// stub the shell to expose those as plain DOM, and skip the editor surface.
vi.mock("../../../components/entity-editor-shell", () => ({
  EntityEditorShell: ({
    sidebar,
    isPending,
    onContentSave,
  }: {
    sidebar?: ReactNode;
    isPending: boolean;
    onContentSave: (content: string) => Promise<void>;
  }) => (
    <div>
      <div data-testid="is-pending">{isPending ? "pending" : "idle"}</div>
      <button data-testid="save-content" onClick={() => void onContentSave("new content")}>
        Save content
      </button>
      <div>{sidebar}</div>
    </div>
  ),
}));

import { AspectEditor } from "./AspectEditor";
import {
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "../../../api/generated/aspects/aspects";
import { getListNotesQueryKey } from "../../../api/generated/notes/notes";
import type { Aspect } from "../../../api/generated/maskorAPI.schemas";

const projectId = "project-1";
const aspectId = "aspect-1";

const baseAspect: Aspect = {
  uuid: aspectId,
  key: "tone",
  category: "stylistic",
  description: "Aspect description",
  notes: [],
};

const wrap = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const seedQueries = (queryClient: QueryClient, aspect: Aspect) => {
  const headers = new Headers();
  queryClient.setQueryData(getGetAspectQueryKey(projectId, aspect.uuid), {
    data: aspect,
    status: 200,
    headers,
  });
  queryClient.setQueryData(getListAspectsQueryKey(projectId), {
    data: [aspect],
    status: 200,
    headers,
  });
  queryClient.setQueryData(getListNotesQueryKey(projectId), {
    data: [{ uuid: "note-1", key: "bridge-obs" }],
    status: 200,
    headers,
  });
};

const mockPatchResponse = (aspect: Aspect, warnings: string[] = []) =>
  new Response(JSON.stringify({ aspect, warnings }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe("AspectEditor — live metadata save", () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
        mutations: { retry: false },
      },
    });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    queryClient.clear();
  });

  it("editing category: input updates immediately, PATCH fires after debounce", async () => {
    seedQueries(queryClient, baseAspect);
    fetchMock.mockResolvedValue(mockPatchResponse({ ...baseAspect, category: "stylistic-x" }));

    render(<AspectEditor projectId={projectId} aspectId={aspectId} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText("Enter category") as HTMLInputElement;
    expect(categoryInput.value).toBe("stylistic");

    act(() => {
      fireEvent.change(categoryInput, { target: { value: "stylistic-x" } });
    });

    expect(categoryInput.value).toBe("stylistic-x");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/projects/${projectId}/aspects/${aspectId}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ category: "stylistic-x" });
  });

  it("isPending stays false during a live metadata save (separate mutation instance)", async () => {
    seedQueries(queryClient, baseAspect);

    // Hold the response so the metadata save stays in-flight while we assert.
    let resolvePatch!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      }),
    );

    render(<AspectEditor projectId={projectId} aspectId={aspectId} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText("Enter category") as HTMLInputElement;
    act(() => {
      fireEvent.change(categoryInput, { target: { value: "stylistic-x" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    // PATCH is in flight — but isPending (driven by the content-save mutation
    // instance) must remain "idle". The metadata save uses a separate
    // useUpdateAspect() instance so its in-flight state doesn't bleed into
    // the content Save button / Cmd+S handler.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("is-pending")).toHaveTextContent("idle");

    // Resolve the PATCH so the test can clean up.
    await act(async () => {
      resolvePatch(mockPatchResponse({ ...baseAspect, category: "stylistic-x" }));
      await flushMicrotasks();
    });
  });

  it("on success: cache adopts the server response (no single-aspect refetch)", async () => {
    seedQueries(queryClient, baseAspect);
    const serverAspect: Aspect = {
      ...baseAspect,
      category: "stylistic-x",
      // Distinct field to verify cache reflects the server response.
      description: "Server-rewritten description",
    };
    fetchMock.mockResolvedValue(mockPatchResponse(serverAspect));

    const aspectQueryKey = getGetAspectQueryKey(projectId, aspectId);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(<AspectEditor projectId={projectId} aspectId={aspectId} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText("Enter category") as HTMLInputElement;
    act(() => {
      fireEvent.change(categoryInput, { target: { value: "stylistic-x" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    type CacheEntry = { data: Aspect; status: number };
    const cached = queryClient.getQueryData<CacheEntry>(aspectQueryKey);
    expect(cached?.data.description).toBe("Server-rewritten description");

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) =>
      JSON.stringify(call[0]?.queryKey),
    );
    expect(invalidatedKeys).not.toContain(JSON.stringify(aspectQueryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(getListAspectsQueryKey(projectId)));
  });

  it("on error: rolls back optimistic write and surfaces the error inline", async () => {
    seedQueries(queryClient, baseAspect);

    // PATCH fails (500); any incidental GET (from invalidate-on-error) returns the seeded aspect.
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (init.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Network down" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(baseAspect), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    render(<AspectEditor projectId={projectId} aspectId={aspectId} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText("Enter category") as HTMLInputElement;
    act(() => {
      fireEvent.change(categoryInput, { target: { value: "stylistic-x" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    type CacheEntry = { data: Aspect; status: number };
    const cached = queryClient.getQueryData<CacheEntry>(getGetAspectQueryKey(projectId, aspectId));
    expect(cached?.data.category).toBe("stylistic");

    expect(screen.getByText(/Network down/i)).toBeInTheDocument();
  });
});
