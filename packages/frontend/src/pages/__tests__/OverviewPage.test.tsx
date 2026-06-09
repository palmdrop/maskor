import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import type { DragEndEvent } from "@dnd-kit/core";
import type * as DndKitCore from "@dnd-kit/core";
import type * as DndKitSortable from "@dnd-kit/sortable";
import type { OverviewDetailLevel } from "../../router";

// jsdom lacks ResizeObserver, which the arc overlay uses to fit to width.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// --- router mock ---

let currentSearch: { sequence?: string; detail?: OverviewDetailLevel } = {
  sequence: undefined,
  detail: "title",
};
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useParams: () => ({ projectId: PROJECT_ID }),
    useSearch: () => currentSearch,
    useNavigate: () => navigateMock,
  };
});

// --- dnd-kit mock: capture onDragEnd so tests can trigger it directly ---

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof DndKitCore>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragStart,
    }: {
      children: ReactNode;
      onDragEnd: (event: DragEndEvent) => void;
      onDragStart?: (event: unknown) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      void onDragStart;
      return <>{children}</>;
    },
    DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
    useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
    useSensor: () => ({}),
    useSensors: (...args: unknown[]) => args,
    closestCenter: vi.fn(),
    pointerWithin: vi.fn(() => []),
    PointerSensor: class {},
  };
});

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof DndKitSortable>();
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

// --- mutation / query mocks ---

const placeMutate = vi.fn();
const moveMutate = vi.fn();
const unplaceMutate = vi.fn();
const moveSectionMutate = vi.fn();
const groupMutate = vi.fn();
const moveManyMutate = vi.fn();
const splitMutate = vi.fn();
const mergeMutate = vi.fn();
const updateProjectMutate = vi.fn();

vi.mock("../../api/generated/sequences/sequences", () => ({
  useListSequences: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetSequenceContents: vi.fn(() => ({ data: { status: 200, data: { placed: [], pool: [] } } })),
  usePlaceFragment: vi.fn(() => ({ mutate: placeMutate })),
  useMoveFragment: vi.fn(() => ({ mutate: moveMutate })),
  useUnplaceFragment: vi.fn(() => ({ mutate: unplaceMutate })),
  useReorderSection: vi.fn(() => ({ mutate: moveSectionMutate })),
  useGroupFragments: vi.fn(() => ({ mutate: groupMutate, mutateAsync: groupMutate })),
  useMoveFragments: vi.fn(() => ({ mutate: moveManyMutate, mutateAsync: moveManyMutate })),
  useSplitSection: vi.fn(() => ({ mutate: splitMutate, mutateAsync: splitMutate })),
  useMergeSection: vi.fn(() => ({ mutate: mergeMutate, mutateAsync: mergeMutate })),
  useDesignateSequenceMain: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useCreateSection: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useRenameSection: vi.fn(() => ({ mutate: vi.fn() })),
  useDeleteSection: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useCreateSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useUpdateSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useDeleteSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useCloneSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useInsertSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  getListSequencesQueryKey: (projectId: string) => [`/projects/${projectId}/sequences`],
  getGetSequenceContentsQueryKey: (projectId: string, sequenceId: string) => [
    `/projects/${projectId}/sequences/${sequenceId}/contents`,
  ],
}));

vi.mock("../../api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: vi.fn(),
  useUpdateFragment: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  getListFragmentSummariesQueryKey: (projectId: string) => [
    `/projects/${projectId}/fragments/summaries`,
  ],
}));

vi.mock("../../api/generated/aspects/aspects", () => ({
  useListAspects: vi.fn(() => ({ data: { status: 200, data: [] }, isLoading: false })),
}));

vi.mock("../../api/generated/projects/projects", () => ({
  useGetProject: vi.fn(() => ({ data: undefined })),
  useUpdateProject: vi.fn(() => ({ mutate: updateProjectMutate })),
  getGetProjectQueryKey: (projectId: string) => [`/projects/${projectId}`],
}));

// --- test data ---

const PROJECT_ID = "proj-1";
const SEQUENCE_UUID = "seq-1";
const SECTION_UUID = "sec-1";
const FRAG_A = "frag-aaa";
const FRAG_B = "frag-bbb";
const FRAG_C = "frag-ccc";

const makeMultiSectionBundleResponse = (sections: { uuid: string; fragmentUuids: string[] }[]) => ({
  status: 200 as const,
  data: {
    sequences: [
      {
        uuid: SEQUENCE_UUID,
        name: "Main",
        isMain: true,
        active: true,
        projectUuid: PROJECT_ID,
        filePath: `${SEQUENCE_UUID}.yaml`,
        contentHash: "hash",
        sections: sections.map((s) => ({
          uuid: s.uuid,
          name: s.uuid,
          fragments: s.fragmentUuids.map((uuid, index) => ({
            uuid: `pos-${s.uuid}-${index}`,
            fragmentUuid: uuid,
            position: index,
          })),
        })),
      },
    ],
    violations: [],
    cycles: [],
  },
});

const makeBundleResponse = (fragmentUuids: string[] = []) =>
  makeMultiSectionBundleResponse([{ uuid: SECTION_UUID, fragmentUuids }]);

const makeFragment = (
  uuid: string,
  key: string,
  excerpt: string | null = "Some text content here.",
  aspects: Record<string, { weight: number }> = {},
) => ({ uuid, key, isDiscarded: false, excerpt, aspects });

const makeFragmentsResponse = (fragments: ReturnType<typeof makeFragment>[]) => ({
  status: 200 as const,
  data: fragments,
});

// --- helpers ---

const { useListSequences, useGetSequenceContents } =
  await import("../../api/generated/sequences/sequences");
const { useListFragmentSummaries } = await import("../../api/generated/fragments/fragments");

const mockSequence = (fragmentUuids: string[] = []) => {
  (useListSequences as Mock).mockReturnValue({
    data: makeBundleResponse(fragmentUuids),
    isLoading: false,
  });
};

const mockMultiSectionSequence = (sections: { uuid: string; fragmentUuids: string[] }[]) => {
  (useListSequences as Mock).mockReturnValue({
    data: makeMultiSectionBundleResponse(sections),
    isLoading: false,
  });
};

const mockFragments = (fragments: ReturnType<typeof makeFragment>[]) => {
  (useListFragmentSummaries as Mock).mockReturnValue({
    data: makeFragmentsResponse(fragments),
    isLoading: false,
  });
};

const mockContents = (
  placed: { fragmentUuid: string; key: string; content: string }[],
  pool: { fragmentUuid: string; key: string; content: string }[] = [],
) => {
  (useGetSequenceContents as Mock).mockReturnValue({
    data: { status: 200, data: { placed, pool } },
  });
};

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <CommandsProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </CommandsProvider>
  );
  return Wrapper;
};

function triggerDragEnd(activeId: string, overId: string) {
  act(() => {
    capturedOnDragEnd?.({
      active: {
        id: activeId,
        rect: { current: { initial: null, translated: null } },
        data: { current: {} },
      },
      over: {
        id: overId,
        rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
        data: { current: {} },
        disabled: false,
      },
      delta: { x: 0, y: 0 },
      activatorEvent: new PointerEvent("pointerdown"),
      collisions: [],
    } as unknown as DragEndEvent);
  });
}

const { OverviewPage } = await import("../OverviewPage");

// ---

describe("OverviewPage — rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  it("shows loading state while data is fetching", () => {
    (useListSequences as Mock).mockReturnValue({ data: undefined, isLoading: true });
    (useListFragmentSummaries as Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<OverviewPage />, { wrapper: wrap() });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the reorder list and pool heading", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });
    expect(screen.getByTestId("reorder-list")).toBeInTheDocument();
    expect(screen.getByText(/Pool/)).toBeInTheDocument();
  });

  it("renders the prose spine with placed fragments at title level", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);
    render(<OverviewPage />, { wrapper: wrap() });
    const spine = screen.getByTestId("prose-spine");
    // The fragment title appears in the spine (and in the reorder list).
    expect(screen.getAllByText("alpha").length).toBeGreaterThanOrEqual(1);
    expect(spine).toBeInTheDocument();
  });

  it("renders an empty section as a drop target when no fragments are placed", () => {
    mockSequence([]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);
    render(<OverviewPage />, { wrapper: wrap() });
    // The spine keeps the (empty) section droppable so the first fragment can be
    // dropped straight in.
    expect(screen.getByTestId("prose-spine")).toBeInTheDocument();
    expect(screen.getAllByText("Drag fragments here.").length).toBeGreaterThanOrEqual(1);
  });

  it("exposes a drag handle on each spine fragment (reorderable at any detail level)", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);
    render(<OverviewPage />, { wrapper: wrap() });
    const spine = screen.getByTestId("prose-spine");
    expect(spine.querySelector('[aria-label^="Drag to reorder"]')).not.toBeNull();
  });

  it("lists unplaced non-discarded fragments in the pool", () => {
    mockSequence([FRAG_A]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      { ...makeFragment(FRAG_C, "gamma"), isDiscarded: true },
    ]);
    render(<OverviewPage />, { wrapper: wrap() });
    expect(screen.getByRole("heading", { name: /Pool/ })).toHaveTextContent("Pool (1)");
    // beta is in the pool; gamma is discarded and excluded.
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("gamma")).toBeNull();
  });
});

describe("OverviewPage — detail-level axis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha", "The river was wide.")]);
    mockContents([{ fragmentUuid: FRAG_A, key: "alpha", content: "The river was wide." }]);
  });

  it("renders the three detail-level buttons", () => {
    render(<OverviewPage />, { wrapper: wrap() });
    const group = screen.getByRole("group", { name: /spine detail level/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prose" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excerpt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
  });

  it("marks the URL detail level active", () => {
    currentSearch = { sequence: undefined, detail: "excerpt" };
    render(<OverviewPage />, { wrapper: wrap() });
    expect(screen.getByRole("button", { name: "Excerpt" })).toHaveAttribute("aria-pressed", "true");
  });

  it("title level shows only the title (no excerpt text)", () => {
    currentSearch = { sequence: undefined, detail: "title" };
    render(<OverviewPage />, { wrapper: wrap() });
    const spine = screen.getByTestId("prose-spine");
    expect(spine.querySelector('[data-detail-level="title"]')).not.toBeNull();
    expect(spine.textContent).not.toContain("The river was wide.");
  });

  it("excerpt level renders the derived excerpt in the spine", () => {
    currentSearch = { sequence: undefined, detail: "excerpt" };
    render(<OverviewPage />, { wrapper: wrap() });
    const spine = screen.getByTestId("prose-spine");
    expect(spine.querySelector('[data-detail-level="excerpt"]')).not.toBeNull();
    expect(spine.textContent).toContain("The river was wide.");
  });

  it("navigates with the chosen detail level when a button is clicked", () => {
    currentSearch = { sequence: "seq-1", detail: "title" };
    render(<OverviewPage />, { wrapper: wrap() });
    fireEvent.click(screen.getByRole("button", { name: "Excerpt" }));

    expect(updateProjectMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      data: { overview: { detailLevel: "excerpt" } },
    });
    const call = navigateMock.mock.calls.at(-1)?.[0];
    expect(call.to).toBe("/projects/$projectId/overview");
    expect(call.search({ sequence: "seq-1", detail: "title" })).toEqual({
      sequence: "seq-1",
      detail: "excerpt",
    });
  });
});

describe("OverviewPage — drag interactions (vertical list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  it("places a pool fragment dropped onto a placed fragment", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });
    triggerDragEnd(FRAG_B, FRAG_A);
    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuid: FRAG_B, sectionUuid: SECTION_UUID, position: 0 },
    });
  });

  it("places a pool fragment at the tail when dropped onto the section zone", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });
    triggerDragEnd(FRAG_B, SECTION_UUID);
    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuid: FRAG_B, sectionUuid: SECTION_UUID, position: 1 },
    });
  });

  it("moves a placed fragment dropped onto another placed fragment", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });
    triggerDragEnd(FRAG_B, FRAG_A);
    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_B,
      data: { sectionUuid: SECTION_UUID, position: 0 },
    });
  });

  it("unplaces a placed fragment dropped onto the pool zone", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);
    render(<OverviewPage />, { wrapper: wrap() });
    triggerDragEnd(FRAG_A, "pool-zone");
    expect(unplaceMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_A,
    });
  });

  it("does not mutate when dropping a pool fragment onto another pool fragment", () => {
    mockSequence([]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });
    triggerDragEnd(FRAG_A, FRAG_B);
    expect(placeMutate).not.toHaveBeenCalled();
    expect(moveMutate).not.toHaveBeenCalled();
    expect(unplaceMutate).not.toHaveBeenCalled();
  });
});

describe("OverviewPage — keyboard fragment movement (vertical)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  it("ArrowDown moves the selected fragment one position forward", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });

    // Select the first fragment via its reorder row.
    const list = screen.getByTestId("reorder-list");
    const row = list.querySelector(`[data-fragment-uuid="${FRAG_A}"]`)!;
    fireEvent.click(row);

    const main = screen.getByTestId("overview-main-content");
    fireEvent.keyDown(main, { key: "ArrowDown" });

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_A,
      data: { sectionUuid: SECTION_UUID, position: 1 },
    });
  });

  it("Shift+ArrowDown moves the selected fragment's section forward", () => {
    mockMultiSectionSequence([
      { uuid: "sec-1", fragmentUuids: [FRAG_A] },
      { uuid: "sec-2", fragmentUuids: [FRAG_B] },
    ]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });

    const list = screen.getByTestId("reorder-list");
    fireEvent.click(list.querySelector(`[data-fragment-uuid="${FRAG_A}"]`)!);

    const main = screen.getByTestId("overview-main-content");
    fireEvent.keyDown(main, { key: "ArrowDown", shiftKey: true });

    expect(moveSectionMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      sectionId: "sec-1",
      data: { position: 1 },
    });
  });
});

describe("OverviewPage — arc overlay and vertical strip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  it("summons the arc overlay when the Arcs toggle is clicked", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha", null, { grief: { weight: 0.5 } })]);
    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.queryByTestId("arc-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Arcs" }));
    expect(screen.getByTestId("arc-overlay")).toBeInTheDocument();
  });

  it("toggles the vertical arc strip", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha", null, { grief: { weight: 0.5 } })]);
    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.queryByTestId("vertical-arc-strip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Strip" }));
    expect(screen.getByTestId("vertical-arc-strip")).toBeInTheDocument();
  });
});

describe("OverviewPage — multi-select section operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  const selectRow = (fragmentUuid: string, options?: { meta?: boolean; shift?: boolean }) => {
    const list = screen.getByTestId("reorder-list");
    const row = list.querySelector(`[data-fragment-uuid="${fragmentUuid}"]`)!;
    fireEvent.click(row, { metaKey: options?.meta ?? false, shiftKey: options?.shift ?? false });
  };

  it("meta-click adds rows to the selection and shows the action bar count", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B, FRAG_C] }]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_A);
    selectRow(FRAG_C, { meta: true });

    expect(screen.getByTestId("selection-action-bar")).toHaveTextContent("2 selected");
  });

  it("Group into section groups the current selection", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B, FRAG_C] }]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_A);
    selectRow(FRAG_C, { meta: true });
    fireEvent.click(screen.getByRole("button", { name: "Group into section" }));

    expect(groupMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuids: [FRAG_A, FRAG_C], name: "" },
    });
  });

  it("shift-click selects a contiguous range", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B, FRAG_C] }]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_A);
    selectRow(FRAG_C, { shift: true });
    fireEvent.click(screen.getByRole("button", { name: "Group into section" }));

    expect(groupMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuids: [FRAG_A, FRAG_B, FRAG_C], name: "" },
    });
  });

  it("Split before splits at the selected fragment", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B, FRAG_C] }]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_B);
    fireEvent.click(screen.getByRole("button", { name: "Split before" }));

    expect(splitMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuid: FRAG_B, name: "" },
    });
  });

  it("Split after splits before the next fragment in the section", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B, FRAG_C] }]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_B);
    fireEvent.click(screen.getByRole("button", { name: "Split after" }));

    // Splitting "after B" inserts the boundary before C.
    expect(splitMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: { fragmentUuid: FRAG_C, name: "" },
    });
  });

  it("disables Split before for the first fragment and Split after for the last", () => {
    mockMultiSectionSequence([{ uuid: "sec-1", fragmentUuids: [FRAG_A, FRAG_B] }]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });

    selectRow(FRAG_A);
    expect(screen.getByRole("button", { name: "Split before" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Split after" })).not.toBeDisabled();

    selectRow(FRAG_B);
    expect(screen.getByRole("button", { name: "Split after" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Split before" })).not.toBeDisabled();
  });
});

describe("OverviewPage — merge sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = { sequence: undefined, detail: "title" };
    (useGetSequenceContents as Mock).mockReturnValue({
      data: { status: 200, data: { placed: [], pool: [] } },
    });
  });

  it("merge-up on the second section merges the first into it (merges the previous section's boundary)", () => {
    mockMultiSectionSequence([
      { uuid: "sec-1", fragmentUuids: [FRAG_A] },
      { uuid: "sec-2", fragmentUuids: [FRAG_B] },
    ]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });

    const list = screen.getByTestId("reorder-list");
    const upButtons = list.querySelectorAll('[aria-label*="into the previous section"]');
    // Only the second section can merge up.
    expect(upButtons).toHaveLength(1);
    fireEvent.click(upButtons[0]!);

    // Merge up on sec-2 merges sec-1 (the upper section) with its next.
    expect(mergeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      sectionId: "sec-1",
    });
  });

  it("merge-down on the first section merges it with the next", () => {
    mockMultiSectionSequence([
      { uuid: "sec-1", fragmentUuids: [FRAG_A] },
      { uuid: "sec-2", fragmentUuids: [FRAG_B] },
    ]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);
    render(<OverviewPage />, { wrapper: wrap() });

    const list = screen.getByTestId("reorder-list");
    const downButtons = list.querySelectorAll('[aria-label*="into the next section"]');
    // Only the first section can merge down.
    expect(downButtons).toHaveLength(1);
    fireEvent.click(downButtons[0]!);

    expect(mergeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      sectionId: "sec-1",
    });
  });
});

describe("parseOverviewDetailLevel", () => {
  it("defaults to prose for undefined", async () => {
    const { parseOverviewDetailLevel } = await import("../../router");
    expect(parseOverviewDetailLevel(undefined)).toBe("prose");
  });

  it("defaults to prose for unknown values", async () => {
    const { parseOverviewDetailLevel } = await import("../../router");
    expect(parseOverviewDetailLevel("bogus")).toBe("prose");
    expect(parseOverviewDetailLevel("")).toBe("prose");
  });

  it("passes through valid values", async () => {
    const { parseOverviewDetailLevel } = await import("../../router");
    expect(parseOverviewDetailLevel("prose")).toBe("prose");
    expect(parseOverviewDetailLevel("excerpt")).toBe("excerpt");
    expect(parseOverviewDetailLevel("title")).toBe("title");
  });

  it("defaults to prose for non-string values", async () => {
    const { parseOverviewDetailLevel } = await import("../../router");
    expect(parseOverviewDetailLevel(null)).toBe("prose");
    expect(parseOverviewDetailLevel(42)).toBe("prose");
    expect(parseOverviewDetailLevel({})).toBe("prose");
  });
});
