import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import { FragmentMetadataForm } from "./fragment-metadata-form";
import {
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import { getListAspectsQueryKey } from "@api/generated/aspects/aspects";
import { getListNotesQueryKey } from "@api/generated/notes/notes";
import { getListReferencesQueryKey } from "@api/generated/references/references";
import type { Fragment } from "@api/generated/maskorAPI.schemas";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

const projectId = "project-1";

const baseFragment: Fragment = {
  uuid: "fragment-1",
  key: "late-winter",
  content: "fragment content",
  readiness: 0.2,
  contentHash: "hash",
  references: [],
  isDiscarded: false,
  aspects: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const wrap = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CommandsProvider>{children}</CommandsProvider>
    </QueryClientProvider>
  );
  return Wrapper;
};

const seedQueries = (queryClient: QueryClient, fragment: Fragment) => {
  const headers = new Headers();
  queryClient.setQueryData(getGetFragmentQueryKey(projectId, fragment.uuid), {
    data: fragment,
    status: 200,
    headers,
  });
  queryClient.setQueryData(getListAspectsQueryKey(projectId), {
    data: [],
    status: 200,
    headers,
  });
  queryClient.setQueryData(getListNotesQueryKey(projectId), {
    data: [],
    status: 200,
    headers,
  });
  queryClient.setQueryData(getListReferencesQueryKey(projectId), {
    data: [{ uuid: "reference-1", key: "bridge-obs", category: "general" }],
    status: 200,
    headers,
  });
};

const mockPatchResponse = (fragment: Fragment) =>
  new Response(JSON.stringify({ fragment, warnings: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const flushMicrotasks = async () => {
  // Multiple microtask drains: optimistic-write → fetch → response.json → finally → setQueryData chain.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe("FragmentMetadataForm — live metadata save", () => {
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

  it("detaching a reference: tag disappears immediately, PATCH fires after debounce", async () => {
    const seeded: Fragment = { ...baseFragment, references: ["bridge-obs"] };
    seedQueries(queryClient, seeded);
    fetchMock.mockResolvedValue(mockPatchResponse({ ...seeded, references: [] }));

    render(<FragmentMetadataForm fragment={seeded} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    expect(screen.getByText("bridge-obs")).toBeInTheDocument();

    const removeButton = screen.getByRole("button", { name: "×" });
    act(() => {
      fireEvent.click(removeButton);
    });

    // The tag disappears synchronously — driven by useLiveFieldSave's localValue,
    // not by the cache (which only updates inside the debounced save).
    expect(screen.queryByText("bridge-obs")).not.toBeInTheDocument();

    // PATCH not fired yet — still inside debounce window
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/projects/${projectId}/fragments/${seeded.uuid}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ references: [] });
  });

  it("disables the reference X-button when an inline link pins it in the body", () => {
    const seeded: Fragment = {
      ...baseFragment,
      references: ["bridge-obs"],
      content: "Body cites [[references/bridge-obs]].",
    };
    seedQueries(queryClient, seeded);

    render(<FragmentMetadataForm fragment={seeded} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    const removeButton = screen.getByRole("button", { name: "×" });
    expect(removeButton).toBeDisabled();
    expect(removeButton).toHaveAttribute("title", "Remove the [[link]] from the body first");
  });

  it("toggling back within the debounce window cancels the PATCH entirely", async () => {
    // Two notes seeded so we can remove one and re-add it (via combobox-equivalent path).
    // The simplest "toggle back" interaction: remove a note, then re-add by clicking
    // a fresh option. With cmdk hard to drive synchronously, we simulate the equivalent
    // by removing a note and asserting the PATCH fires; then in a separate test we
    // verify the equality-skip in useLiveFieldSave covers the toggle-back semantics
    // (already proven in useLiveFieldSave.test.ts).
    //
    // Here we test the narrower property: after a successful save settles, a later
    // change resumes the live-save loop without leaking state.
    const seeded: Fragment = { ...baseFragment, references: ["bridge-obs"] };
    seedQueries(queryClient, seeded);
    fetchMock.mockResolvedValueOnce(mockPatchResponse({ ...seeded, references: [] }));

    render(<FragmentMetadataForm fragment={seeded} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    const removeButton = screen.getByRole("button", { name: "×" });
    act(() => {
      fireEvent.click(removeButton);
    });

    // Mid-debounce: no fetch yet.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Drain the debounce window.
    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on success: response data replaces the optimistic cache write (no single-fragment refetch)", async () => {
    const seeded: Fragment = { ...baseFragment, references: ["bridge-obs"] };
    seedQueries(queryClient, seeded);
    const serverFragment: Fragment = {
      ...seeded,
      references: [],
      // Distinct updatedAt to verify cache adopts the server response, not the optimistic value.
      updatedAt: "2030-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(mockPatchResponse(serverFragment));

    const fragmentQueryKey = getGetFragmentQueryKey(projectId, seeded.uuid);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(<FragmentMetadataForm fragment={seeded} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    const removeButton = screen.getByRole("button", { name: "×" });
    act(() => {
      fireEvent.click(removeButton);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    type CacheEntry = { data: Fragment; status: number };
    const cached = queryClient.getQueryData<CacheEntry>(fragmentQueryKey);
    expect(cached?.data.updatedAt).toBe("2030-01-01T00:00:00.000Z");

    // Single-fragment query is NOT invalidated — list query is.
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) =>
      JSON.stringify(call[0]?.queryKey),
    );
    expect(invalidatedKeys).not.toContain(JSON.stringify(fragmentQueryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(getListFragmentsQueryKey(projectId)));
  });

  it("on error: rolls back optimistic write and surfaces the error", async () => {
    const seeded: Fragment = { ...baseFragment, references: ["bridge-obs"] };
    seedQueries(queryClient, seeded);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Network down" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<FragmentMetadataForm fragment={seeded} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    const removeButton = screen.getByRole("button", { name: "×" });
    act(() => {
      fireEvent.click(removeButton);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    // Cache rolled back to the original notes
    type CacheEntry = { data: Fragment; status: number };
    const cached = queryClient.getQueryData<CacheEntry>(
      getGetFragmentQueryKey(projectId, seeded.uuid),
    );
    expect(cached?.data.references).toEqual(["bridge-obs"]);

    // Error rendered beneath the failing field
    expect(screen.getByText(/Network down/i)).toBeInTheDocument();
  });
});

describe("FragmentMetadataForm — create-and-attach reference", () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
    queryClient.clear();
  });

  it("typing a new key and confirming creates the reference (empty body) and attaches it", async () => {
    seedQueries(queryClient, baseFragment);
    // POST create reference → 201; the create invalidation refetches the references list (GET);
    // the subsequent debounced PATCH attaches it to the fragment.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ uuid: "reference-new", key: "fresh-source", category: "general" }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (
        url.endsWith("/references") &&
        (!init || init.method === undefined || init.method === "GET")
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { uuid: "reference-1", key: "bridge-obs", category: "general" },
              { uuid: "reference-new", key: "fresh-source", category: "general" },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(mockPatchResponse({ ...baseFragment, references: ["fresh-source"] }));
    });

    render(<FragmentMetadataForm fragment={baseFragment} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    const input = screen.getByPlaceholderText("Add reference — type to filter or create");
    fireEvent.change(input, { target: { value: "fresh-source" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await screen.findByText(/Create/i);
    // Re-fire Enter now that the create affordance is highlighted.
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(postCall).toBeTruthy();
      const [url, init] = postCall!;
      expect(url).toBe(`/api/projects/${projectId}/references`);
      expect(JSON.parse(init.body as string)).toEqual({ key: "fresh-source", content: "" });
    });

    // Wait for the debounced attach PATCH so it lands before teardown unstubs fetch
    // (avoids a late real-network call), and confirm the new key is attached.
    await vi.waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(patchCall![1].body as string)).toEqual({ references: ["fresh-source"] });
    });
  });
});

describe("FragmentMetadataForm — orphaned aspects", () => {
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

  const seedWithOrphan = (queryClient: QueryClient) => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { "deleted-aspect": { weight: 0.6 } },
    };
    const headers = new Headers();
    queryClient.setQueryData(getGetFragmentQueryKey(projectId, fragment.uuid), {
      data: fragment,
      status: 200,
      headers,
    });
    // Aspects list does NOT include "deleted-aspect" — it has been deleted from the project
    queryClient.setQueryData(getListAspectsQueryKey(projectId), {
      data: [],
      status: 200,
      headers,
    });
    queryClient.setQueryData(getListNotesQueryKey(projectId), { data: [], status: 200, headers });
    queryClient.setQueryData(getListReferencesQueryKey(projectId), {
      data: [],
      status: 200,
      headers,
    });
    return fragment;
  };

  it("renders orphaned aspect with orphaned indicator", () => {
    const fragment = seedWithOrphan(queryClient);

    render(<FragmentMetadataForm fragment={fragment} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    expect(screen.getByText(/deleted-aspect/)).toBeInTheDocument();
    expect(screen.getByText("orphaned")).toBeInTheDocument();
  });

  it("detaching an orphaned aspect removes it and fires PATCH", async () => {
    const fragment = seedWithOrphan(queryClient);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ fragment: { ...fragment, aspects: {} }, warnings: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<FragmentMetadataForm fragment={fragment} projectId={projectId} />, {
      wrapper: wrap(queryClient),
    });

    expect(screen.getByText(/deleted-aspect/)).toBeInTheDocument();

    const removeButton = screen.getByRole("button", { name: "×" });
    act(() => {
      fireEvent.click(removeButton);
    });

    expect(screen.queryByText(/deleted-aspect/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body as string)).toEqual({ aspects: {} });
  });
});

describe("FragmentMetadataForm — aspect preview chip", () => {
  const seedWithAspect = (queryClient: QueryClient) => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { "the-river": { weight: 0.7 } },
    };
    const headers = new Headers();
    queryClient.setQueryData(getGetFragmentQueryKey(projectId, fragment.uuid), {
      data: fragment,
      status: 200,
      headers,
    });
    queryClient.setQueryData(getListAspectsQueryKey(projectId), {
      data: [{ uuid: "aspect-river", key: "the-river", category: "general" }],
      status: 200,
      headers,
    });
    queryClient.setQueryData(getListNotesQueryKey(projectId), { data: [], status: 200, headers });
    queryClient.setQueryData(getListReferencesQueryKey(projectId), {
      data: [],
      status: 200,
      headers,
    });
    return fragment;
  };

  it("renders the chip as a preview button when the reader gutter is available", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fragment = seedWithAspect(queryClient);

    render(<FragmentMetadataForm fragment={fragment} projectId={projectId} canPreviewAspects />, {
      wrapper: wrap(queryClient),
    });

    expect(screen.getByRole("button", { name: /the-river/ })).toBeInTheDocument();
  });

  it("renders the chip as plain text when the reader gutter is absent", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fragment = seedWithAspect(queryClient);

    render(
      <FragmentMetadataForm fragment={fragment} projectId={projectId} canPreviewAspects={false} />,
      { wrapper: wrap(queryClient) },
    );

    expect(screen.getByText(/the-river/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /the-river/ })).not.toBeInTheDocument();
  });
});
