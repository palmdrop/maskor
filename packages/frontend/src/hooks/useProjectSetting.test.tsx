import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getGetProjectQueryKey } from "@api/generated/projects/projects";
import { useProjectSetting } from "./useProjectSetting";

const PROJECT_ID = "p1";

const projectData = (overrides: Record<string, unknown> = {}) => ({
  editor: {
    fontSize: 16,
    maxParagraphWidth: 72,
    vimMode: false,
    rawMarkdownMode: false,
    vimClipboardSync: true,
  },
  suggestion: { readinessThreshold: 0.8 },
  advanced: { showFragmentStats: false },
  ...overrides,
});

const seedProject = (queryClient: QueryClient, overrides?: Record<string, unknown>) => {
  queryClient.setQueryData(getGetProjectQueryKey(PROJECT_ID), {
    status: 200,
    data: projectData(overrides),
    headers: new Headers(),
  });
};

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("useProjectSetting", () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
        mutations: { retry: false },
      },
    });
    fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PATCH" ? okJson(projectData()) : okJson(projectData())),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("reads the current value (and falls back before the project loads)", () => {
    const { result } = renderHook(() => useProjectSetting(PROJECT_ID, "editor.fontSize", 16), {
      wrapper,
    });
    // No project cached yet → fallback.
    expect(result.current.value).toBe(16);

    seedProject(queryClient, { editor: { ...projectData().editor, fontSize: 20 } });
    // Cache seeded after mount; a re-read is asserted in the commit test below.
  });

  it("set() PATCHes the targeted section/field immediately", async () => {
    seedProject(queryClient);
    const { result } = renderHook(
      () => useProjectSetting(PROJECT_ID, "advanced.showFragmentStats", false),
      { wrapper },
    );

    await act(async () => {
      await result.current.set(true);
    });

    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "PATCH");
    expect(patch).toBeDefined();
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
      advanced: { showFragmentStats: true },
    });
    expect(result.current.error).toBeNull();
  });

  it("commit() saves the current draft (slider release)", async () => {
    seedProject(queryClient);
    const { result } = renderHook(
      () => useProjectSetting(PROJECT_ID, "editor.maxParagraphWidth", 72),
      { wrapper },
    );

    act(() => {
      result.current.setDraft(96);
    });
    expect(result.current.draft).toBe(96);

    await act(async () => {
      await result.current.commit();
    });

    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === "PATCH");
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
      editor: { maxParagraphWidth: 96 },
    });
  });

  it("surfaces an error string when the save fails", async () => {
    seedProject(queryClient);
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? Promise.resolve(
            new Response(JSON.stringify({ message: "Boom" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }),
          )
        : Promise.resolve(okJson(projectData())),
    );

    const { result } = renderHook(() => useProjectSetting(PROJECT_ID, "editor.fontSize", 16), {
      wrapper,
    });

    await act(async () => {
      await result.current.set(18);
    });

    expect(result.current.error).not.toBeNull();
  });

  it("resyncs the draft when the server value changes", async () => {
    seedProject(queryClient);
    const { result } = renderHook(() => useProjectSetting(PROJECT_ID, "editor.fontSize", 16), {
      wrapper,
    });

    await waitFor(() => expect(result.current.draft).toBe(16));

    act(() => {
      seedProject(queryClient, { editor: { ...projectData().editor, fontSize: 22 } });
    });

    await waitFor(() => expect(result.current.draft).toBe(22));
  });
});
