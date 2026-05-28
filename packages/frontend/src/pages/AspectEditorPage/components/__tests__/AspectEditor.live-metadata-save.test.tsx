import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
    useNavigate: () => vi.fn(),
  };
});

// EntityEditorShell has heavy dependencies (ProseEditor + TipTap, project config hook).
// For this test we only care about the sidebar wiring and isPending propagation —
// stub the shell to expose those as plain DOM and skip the editor surface.
vi.mock("@components/entity-editor-shell", () => ({
  EntityEditorShell: ({ sidebar, isPending }: { sidebar?: ReactNode; isPending: boolean }) => (
    <div>
      <div data-testid="is-pending">{isPending ? "pending" : "idle"}</div>
      <div>{sidebar}</div>
    </div>
  ),
}));

vi.mock("@api/action-log", () => ({
  useInvalidateActionLog: () => vi.fn(),
}));

import { AspectEditor } from "../AspectEditor";
import { getGetAspectQueryKey, getListAspectsQueryKey } from "@api/generated/aspects/aspects";
import { getListNotesQueryKey } from "@api/generated/notes/notes";
import type { Aspect } from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "proj-1";
const ASPECT_ID = "aspect-1";

const baseAspect: Aspect = {
  uuid: ASPECT_ID,
  key: "tone",
  category: "stylistic",
  color: undefined,
  description: "Aspect description",
  notes: [],
};

const makeHeaders = () => new Headers({ "Content-Type": "application/json" });

const seedAspect = (queryClient: QueryClient, aspect: Aspect) => {
  queryClient.setQueryData(getGetAspectQueryKey(PROJECT_ID, ASPECT_ID), {
    data: aspect,
    status: 200,
    headers: makeHeaders(),
  });
  queryClient.setQueryData(getListAspectsQueryKey(PROJECT_ID), {
    data: [aspect],
    status: 200,
    headers: makeHeaders(),
  });
  queryClient.setQueryData(getListNotesQueryKey(PROJECT_ID), {
    data: [],
    status: 200,
    headers: makeHeaders(),
  });
};

const mockPatchResponse = (aspect: Aspect, warnings: string[] = []) =>
  new Response(JSON.stringify({ aspect, warnings }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const wrap = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CommandsProvider>{children}</CommandsProvider>
    </QueryClientProvider>
  );
  return Wrapper;
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

  it("isPending stays false during a live metadata save (separate mutation instance)", async () => {
    seedAspect(queryClient, baseAspect);

    // Hold the response so the metadata save stays in-flight while we assert.
    let resolvePatch!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      }),
    );

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText(/empty for root/);
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
    seedAspect(queryClient, baseAspect);
    const serverAspect: Aspect = {
      ...baseAspect,
      category: "stylistic-x",
      // Distinct field to verify cache reflects the server response.
      description: "Server-rewritten description",
    };
    fetchMock.mockResolvedValue(mockPatchResponse(serverAspect));

    const aspectQueryKey = getGetAspectQueryKey(PROJECT_ID, ASPECT_ID);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText(/empty for root/);
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
    expect(invalidatedKeys).toContain(JSON.stringify(getListAspectsQueryKey(PROJECT_ID)));
  });

  it("on error: rolls back optimistic write and surfaces the error inline", async () => {
    seedAspect(queryClient, baseAspect);

    // PATCH fails (500); any incidental GET returns the seeded aspect (single
    // endpoint) or a single-item list (list endpoint).
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (init.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify({ message: "Network down" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      const isListEndpoint = url.endsWith("/aspects") || url.endsWith("/notes");
      return Promise.resolve(
        new Response(JSON.stringify(isListEndpoint ? [baseAspect] : baseAspect), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const categoryInput = screen.getByPlaceholderText(/empty for root/);
    act(() => {
      fireEvent.change(categoryInput, { target: { value: "stylistic-x" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    type CacheEntry = { data: Aspect; status: number };
    const cached = queryClient.getQueryData<CacheEntry>(
      getGetAspectQueryKey(PROJECT_ID, ASPECT_ID),
    );
    expect(cached?.data.category).toBe("stylistic");

    expect(screen.getByText(/Network down/i)).toBeInTheDocument();
  });
});
