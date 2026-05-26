import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Each test seeds the mocked list hooks via these refs.
type QueryResult<T> = {
  data?: { status: number; data: T };
  isLoading: boolean;
  isError: boolean;
};

type FragmentSummary = { uuid: string; key: string; isDiscarded: boolean };
type AspectLike = { uuid: string; key: string };
type SequenceLike = { uuid: string; name: string };

const fragmentsResult: { current: QueryResult<FragmentSummary[]> } = {
  current: { data: { status: 200, data: [] }, isLoading: false, isError: false },
};
const aspectsResult: { current: QueryResult<AspectLike[]> } = {
  current: { data: { status: 200, data: [] }, isLoading: false, isError: false },
};
const notesResult: { current: QueryResult<AspectLike[]> } = {
  current: { data: { status: 200, data: [] }, isLoading: false, isError: false },
};
const referencesResult: { current: QueryResult<AspectLike[]> } = {
  current: { data: { status: 200, data: [] }, isLoading: false, isError: false },
};
const sequencesResult: { current: QueryResult<{ sequences: SequenceLike[] }> } = {
  current: { data: { status: 200, data: { sequences: [] } }, isLoading: false, isError: false },
};

const navigateMock = vi.fn();
const recordPickMock = vi.fn().mockResolvedValue({ status: 204, data: undefined });

// Mutable matches array so per-test we can simulate different current routes.
const routerMatches: { value: Array<{ routeId: string }> } = { value: [] };

vi.mock("@api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: () => fragmentsResult.current,
}));
vi.mock("@api/generated/aspects/aspects", () => ({
  useListAspects: () => aspectsResult.current,
}));
vi.mock("@api/generated/notes/notes", () => ({
  useListNotes: () => notesResult.current,
}));
vi.mock("@api/generated/references/references", () => ({
  useListReferences: () => referencesResult.current,
}));
vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: () => sequencesResult.current,
}));
vi.mock("@api/generated/suggestion/suggestion", () => ({
  RecordFragmentPick: (...args: unknown[]) => recordPickMock(...args),
}));
vi.mock("@/router", () => ({
  router: {
    navigate: navigateMock,
    get state() {
      return { matches: routerMatches.value };
    },
  },
}));

const { QuickSwitcher } = await import("../QuickSwitcher");

const renderSwitcher = (open = true) =>
  render(
    <QuickSwitcher projectId="p-1" open={open} onOpenChange={() => {}} />,
  );

const resetFixtures = () => {
  fragmentsResult.current = {
    data: { status: 200, data: [] },
    isLoading: false,
    isError: false,
  };
  aspectsResult.current = {
    data: { status: 200, data: [] },
    isLoading: false,
    isError: false,
  };
  notesResult.current = {
    data: { status: 200, data: [] },
    isLoading: false,
    isError: false,
  };
  referencesResult.current = {
    data: { status: 200, data: [] },
    isLoading: false,
    isError: false,
  };
  sequencesResult.current = {
    data: { status: 200, data: { sequences: [] } },
    isLoading: false,
    isError: false,
  };
  routerMatches.value = [];
  navigateMock.mockReset();
  recordPickMock.mockClear();
};

beforeEach(resetFixtures);

describe("QuickSwitcher — catalog and grouping", () => {
  it("empty query renders grouped sections in prescribed order; empty groups omitted", () => {
    fragmentsResult.current = {
      data: {
        status: 200,
        data: [
          { uuid: "f-1", key: "river", isDiscarded: false },
          { uuid: "f-2", key: "ash", isDiscarded: false },
        ],
      },
      isLoading: false,
      isError: false,
    };
    aspectsResult.current = {
      data: { status: 200, data: [{ uuid: "a-1", key: "melancholy" }] },
      isLoading: false,
      isError: false,
    };
    // notes + references intentionally empty → those headings must NOT appear.
    sequencesResult.current = {
      data: { status: 200, data: { sequences: [{ uuid: "s-1", name: "main" }] } },
      isLoading: false,
      isError: false,
    };

    renderSwitcher();

    const headings = screen.getAllByText(/^(Fragments|Aspects|Notes|References|Sequences)$/);
    const headingTexts = headings.map((node) => node.textContent);
    expect(headingTexts).toEqual(["Fragments", "Aspects", "Sequences"]);

    // Alphabetical within fragments — ash before river.
    const fragmentRows = screen.getAllByText(/^(ash|river)$/);
    expect(fragmentRows[0]!.textContent).toBe("ash");
    expect(fragmentRows[1]!.textContent).toBe("river");
  });

  it("typed query produces a flat ranked list (no group headings)", async () => {
    fragmentsResult.current = {
      data: {
        status: 200,
        data: [
          { uuid: "f-1", key: "river", isDiscarded: false },
          { uuid: "f-2", key: "ash", isDiscarded: false },
        ],
      },
      isLoading: false,
      isError: false,
    };

    renderSwitcher();

    const input = screen.getByPlaceholderText("Jump to entity…");
    await userEvent.type(input, "ash");

    expect(screen.queryByText("Fragments")).not.toBeInTheDocument();
    expect(screen.getByText("ash")).toBeInTheDocument();
    expect(screen.queryByText("river")).not.toBeInTheDocument();
  });

  it("renders 'No matches.' when typed query matches nothing", async () => {
    fragmentsResult.current = {
      data: { status: 200, data: [{ uuid: "f-1", key: "river", isDiscarded: false }] },
      isLoading: false,
      isError: false,
    };

    renderSwitcher();
    const input = screen.getByPlaceholderText("Jump to entity…");
    await userEvent.type(input, "qqqqq");

    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("discarded fragments are filtered out of the catalog", () => {
    fragmentsResult.current = {
      data: {
        status: 200,
        data: [
          { uuid: "f-1", key: "river", isDiscarded: false },
          { uuid: "f-2", key: "discarded-one", isDiscarded: true },
        ],
      },
      isLoading: false,
      isError: false,
    };

    renderSwitcher();
    expect(screen.getByText("river")).toBeInTheDocument();
    expect(screen.queryByText("discarded-one")).not.toBeInTheDocument();
  });

  it("a key shared across two entity types renders two rows distinguished by chip", () => {
    fragmentsResult.current = {
      data: { status: 200, data: [{ uuid: "f-1", key: "river", isDiscarded: false }] },
      isLoading: false,
      isError: false,
    };
    notesResult.current = {
      data: { status: 200, data: [{ uuid: "n-1", key: "river" }] },
      isLoading: false,
      isError: false,
    };

    renderSwitcher();

    const rows = screen.getAllByText("river");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Fragment")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
  });

  it("renders the empty-project state when all queries resolve empty", () => {
    renderSwitcher();
    expect(
      screen.getByText(/This project is empty\. Create a fragment/),
    ).toBeInTheDocument();
  });
});

describe("QuickSwitcher — open semantics integration", () => {
  it("fragment pick outside suggestion mode navigates to /fragments/:uuid and does NOT call recordPick", async () => {
    fragmentsResult.current = {
      data: { status: 200, data: [{ uuid: "f-1", key: "river", isDiscarded: false }] },
      isLoading: false,
      isError: false,
    };
    routerMatches.value = [
      { routeId: "/projects/$projectId" },
      { routeId: "/projects/$projectId/overview" },
    ];

    renderSwitcher();
    await userEvent.click(screen.getByText("river"));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/fragments/$fragmentId",
      params: { projectId: "p-1", fragmentId: "f-1" },
    });
    expect(recordPickMock).not.toHaveBeenCalled();
  });

  it("fragment pick inside suggestion mode swaps in place AND calls recordPick", async () => {
    fragmentsResult.current = {
      data: { status: 200, data: [{ uuid: "f-1", key: "river", isDiscarded: false }] },
      isLoading: false,
      isError: false,
    };
    routerMatches.value = [
      { routeId: "/projects/$projectId" },
      { routeId: "/projects/$projectId/suggestion" },
    ];

    renderSwitcher();
    await userEvent.click(screen.getByText("river"));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/suggestion",
      params: { projectId: "p-1" },
      search: { fragment: "f-1" },
    });
    expect(recordPickMock).toHaveBeenCalledWith("p-1", "f-1");
  });

  it("sequence pick navigates to overview with merged search (preserves density)", async () => {
    sequencesResult.current = {
      data: { status: 200, data: { sequences: [{ uuid: "s-1", name: "main" }] } },
      isLoading: false,
      isError: false,
    };
    routerMatches.value = [
      { routeId: "/projects/$projectId" },
      { routeId: "/projects/$projectId/overview" },
    ];

    renderSwitcher();
    await userEvent.click(screen.getByText("main"));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]![0] as {
      to: string;
      params: Record<string, string>;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.to).toBe("/projects/$projectId/overview");
    expect(call.params).toEqual({ projectId: "p-1" });
    expect(call.search({ density: "compact" })).toEqual({
      density: "compact",
      sequence: "s-1",
    });
  });
});

describe("QuickSwitcher — global keybinding", () => {
  // The switcher is rendered in closed state for these tests; we only care
  // that Cmd/Ctrl+O calls onOpenChange(true) from any focus, including
  // contentEditable elements that editors install on.
  it("Cmd+O fires onOpenChange(true) from body focus", () => {
    const onOpenChange = vi.fn();
    render(<QuickSwitcher projectId="p-1" open={false} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "o", metaKey: true, bubbles: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("Ctrl+O fires onOpenChange(true)", () => {
    const onOpenChange = vi.fn();
    render(<QuickSwitcher projectId="p-1" open={false} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "o", ctrlKey: true, bubbles: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("Cmd+O fires from inside a contentEditable (capture-phase preempts editor)", () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <div data-testid="editor" contentEditable suppressContentEditableWarning>
          editor
        </div>
        <QuickSwitcher projectId="p-1" open={false} onOpenChange={onOpenChange} />
      </>,
    );
    const editor = screen.getByTestId("editor");
    act(() => editor.focus());
    fireEvent.keyDown(editor, { key: "o", metaKey: true, bubbles: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("does not fire on plain 'o' without modifier", () => {
    const onOpenChange = vi.fn();
    render(<QuickSwitcher projectId="p-1" open={false} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(window, { key: "o", bubbles: true });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
