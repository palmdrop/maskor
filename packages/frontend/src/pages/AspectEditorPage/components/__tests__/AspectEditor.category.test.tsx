import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@components/entity-editor-shell", () => ({
  EntityEditorShell: ({ sidebar }: { sidebar?: ReactNode }) => (
    <div data-testid="editor-shell">{sidebar}</div>
  ),
}));

vi.mock("@api/action-log", () => ({
  useInvalidateActionLog: () => vi.fn(),
}));

import { AspectEditor } from "../AspectEditor";
import {
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "@api/generated/aspects/aspects";
import { getListNotesQueryKey } from "@api/generated/notes/notes";
import type { Aspect } from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "proj-1";
const ASPECT_ID = "aspect-1";

const baseAspect: Aspect = {
  uuid: ASPECT_ID,
  key: "tone",
  category: undefined,
  color: undefined,
  description: "",
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
  // Seed notes list so useListNotes doesn't fire an uncached fetch
  queryClient.setQueryData(getListNotesQueryKey(PROJECT_ID), {
    data: [],
    status: 200,
    headers: makeHeaders(),
  });
};

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false },
      mutations: { retry: false },
    },
  });

const wrap = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CommandsProvider>{children}</CommandsProvider>
    </QueryClientProvider>
  );
  return Wrapper;
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("AspectEditor — category field (rendering)", () => {
  it("renders the category input", () => {
    const queryClient = makeQueryClient();
    seedAspect(queryClient, baseAspect);
    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });
    expect(screen.getByPlaceholderText(/empty for root/)).toBeInTheDocument();
  });

  it("pre-fills the category input from the server value", () => {
    const queryClient = makeQueryClient();
    seedAspect(queryClient, { ...baseAspect, category: "world/places" });
    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });
    expect(screen.getByDisplayValue("world/places")).toBeInTheDocument();
  });

  it("autocomplete shows existing categories from the list", async () => {
    const queryClient = makeQueryClient();
    seedAspect(queryClient, baseAspect);
    queryClient.setQueryData(getListAspectsQueryKey(PROJECT_ID), {
      data: [
        { ...baseAspect, uuid: "a-1", key: "tone", category: "world/places" },
        { ...baseAspect, uuid: "a-2", key: "mood", category: "world/characters" },
      ],
      status: 200,
      headers: makeHeaders(),
    });

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.click(input);

    expect(screen.getByText("world/places")).toBeInTheDocument();
    expect(screen.getByText("world/characters")).toBeInTheDocument();
  });

  it("invalid chars show an inline error", async () => {
    const queryClient = makeQueryClient();
    seedAspect(queryClient, baseAspect);

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.type(input, "bad?input");

    expect(
      screen.getByText(/letters, numbers, spaces, hyphens, and underscores/),
    ).toBeInTheDocument();
  });
});

describe("AspectEditor — category PATCH debounce", () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = makeQueryClient();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    queryClient.clear();
  });

  it("typing a valid category fires a PATCH after the debounce", async () => {
    seedAspect(queryClient, baseAspect);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          aspect: { ...baseAspect, category: "arcs" },
          warnings: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const input = screen.getByPlaceholderText(/empty for root/);
    act(() => {
      fireEvent.change(input, { target: { value: "arcs" } });
    });

    // Still inside debounce window — no PATCH yet
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call as [string, RequestInit];
      return url.includes(`/aspects/${ASPECT_ID}`) && init.method === "PATCH";
    }) as [string, RequestInit] | undefined;
    expect(patchCall).toBeDefined();
    const [, patchInit] = patchCall!;
    expect(JSON.parse(patchInit.body as string)).toMatchObject({ category: "arcs" });
  });

  it("invalid category does not fire PATCH even after debounce window", async () => {
    seedAspect(queryClient, baseAspect);

    render(<AspectEditor projectId={PROJECT_ID} aspectId={ASPECT_ID} />, {
      wrapper: wrap(queryClient),
    });

    const input = screen.getByPlaceholderText(/empty for root/);
    act(() => {
      fireEvent.change(input, { target: { value: "bad?input" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushMicrotasks();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
