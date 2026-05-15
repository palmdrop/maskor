import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type * as DndKitCore from "@dnd-kit/core";
import type * as DndKitSortable from "@dnd-kit/sortable";

// --- router mock ---

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
}));

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
      void onDragStart; // unused in tests
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

// --- mutation mocks ---

const placeMutate = vi.fn();
const moveMutate = vi.fn();
const unplaceMutate = vi.fn();

vi.mock("../../api/generated/sequences/sequences", () => ({
  useGetMainSequence: vi.fn(),
  usePlaceFragment: vi.fn(() => ({ mutate: placeMutate })),
  useMoveFragment: vi.fn(() => ({ mutate: moveMutate })),
  useUnplaceFragment: vi.fn(() => ({ mutate: unplaceMutate })),
  getGetMainSequenceQueryKey: (projectId: string) => [`/projects/${projectId}/sequences/main`],
}));

vi.mock("../../api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: vi.fn(),
}));

// --- test data ---

const PROJECT_ID = "proj-1";
const SEQUENCE_UUID = "seq-1";
const SECTION_UUID = "sec-1";
const FRAG_A = "frag-aaa";
const FRAG_B = "frag-bbb";
const FRAG_C = "frag-ccc";

const makeSequenceResponse = (fragmentUuids: string[] = []) => ({
  status: 200 as const,
  data: {
    uuid: SEQUENCE_UUID,
    name: "Main",
    isMain: true,
    projectUuid: PROJECT_ID,
    filePath: `${SEQUENCE_UUID}.yaml`,
    contentHash: "hash",
    sections: [
      {
        uuid: SECTION_UUID,
        name: "Main",
        fragments: fragmentUuids.map((uuid, index) => ({
          uuid: `pos-${index}`,
          fragmentUuid: uuid,
          position: index,
        })),
      },
    ],
  },
});

const makeFragment = (uuid: string, key: string, excerpt = "Some text content here.") => ({
  uuid,
  key,
  isDiscarded: false,
  excerpt,
});

const makeFragmentsResponse = (fragments: ReturnType<typeof makeFragment>[]) => ({
  status: 200 as const,
  data: fragments,
});

// --- helpers ---

const { useGetMainSequence } = await import("../../api/generated/sequences/sequences");
const { useListFragmentSummaries } = await import("../../api/generated/fragments/fragments");

const mockSequence = (fragmentUuids: string[] = []) => {
  (useGetMainSequence as Mock).mockReturnValue({
    data: makeSequenceResponse(fragmentUuids),
    isLoading: false,
  });
};

const mockFragments = (fragments: ReturnType<typeof makeFragment>[]) => {
  (useListFragmentSummaries as Mock).mockReturnValue({
    data: makeFragmentsResponse(fragments),
    isLoading: false,
  });
};

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

// Trigger a drag-end event as if a tile was dragged
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

// --- import component after mocks ---
const { OverviewPage } = await import("../OverviewPage");

// ---

describe("OverviewPage — rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
  });

  it("shows loading state while data is fetching", () => {
    (useGetMainSequence as Mock).mockReturnValue({ data: undefined, isLoading: true });
    (useListFragmentSummaries as Mock).mockReturnValue({ data: undefined, isLoading: true });

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders Sequence and Pool headings", () => {
    mockSequence([]);
    mockFragments([]);

    render(<OverviewPage />, { wrapper: wrap() });

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.some((h) => /sequence/i.test(h.textContent ?? ""))).toBe(true);
    expect(headings.some((h) => /pool/i.test(h.textContent ?? ""))).toBe(true);
  });

  it("renders empty-sequence prompt when no fragments are placed", () => {
    mockSequence([]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText(/drag fragments here/i)).toBeInTheDocument();
  });

  it("renders placed fragment tiles in the sequence zone", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("renders unplaced non-discarded fragments in the pool", () => {
    mockSequence([FRAG_A]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      makeFragment(FRAG_B, "beta"),
      makeFragment(FRAG_C, "gamma"),
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    // alpha is in sequence — beta and gamma are in pool
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });

  it("excludes discarded fragments from the pool", () => {
    mockSequence([]);
    mockFragments([
      makeFragment(FRAG_A, "alpha"),
      { ...makeFragment(FRAG_B, "beta"), isDiscarded: true },
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("shows all-placed message when pool is empty", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha")]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText(/all fragments are placed/i)).toBeInTheDocument();
  });

  it("shows correct counts in headings", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    const headings = screen.getAllByRole("heading", { level: 2 });
    const sequenceHeading = headings.find((h) => /sequence/i.test(h.textContent ?? ""));
    const poolHeading = headings.find((h) => /pool/i.test(h.textContent ?? ""));
    expect(sequenceHeading?.textContent).toMatch(/\(1\)/);
    expect(poolHeading?.textContent).toMatch(/\(1\)/);
  });
});

describe("OverviewPage — drag interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
  });

  it("calls placeFragment when a pool tile is dropped onto a sequence tile", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // FRAG_B is in pool; drop it over FRAG_A (in sequence) → place at index 0
    triggerDragEnd(FRAG_B, FRAG_A);

    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: {
        fragmentUuid: FRAG_B,
        sectionUuid: SECTION_UUID,
        position: 0,
      },
    });
  });

  it("calls placeFragment at tail when dropped onto the sequence zone container", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Drop FRAG_B onto the zone itself → append
    triggerDragEnd(FRAG_B, "sequence-zone");

    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: {
        fragmentUuid: FRAG_B,
        sectionUuid: SECTION_UUID,
        position: 1, // sequence has 1 item → append at index 1
      },
    });
  });

  it("calls moveFragment when a sequence tile is dropped onto another sequence tile", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Move FRAG_A (index 0) over FRAG_B (index 1) → should call move with position 1
    triggerDragEnd(FRAG_A, FRAG_B);

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_A,
      data: {
        sectionUuid: SECTION_UUID,
        position: 1,
      },
    });
  });

  it("calls unplaceFragment when a sequence tile is dropped onto the pool zone", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Drag FRAG_A from sequence to the pool zone
    triggerDragEnd(FRAG_A, "pool-zone");

    expect(unplaceMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_A,
    });
  });

  it("calls unplaceFragment when a sequence tile is dropped onto a pool tile", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Drag FRAG_A (in sequence) over FRAG_B (in pool)
    triggerDragEnd(FRAG_A, FRAG_B);

    expect(unplaceMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      fragmentUuid: FRAG_A,
    });
  });

  it("does not call any mutation when dropping a pool tile onto another pool tile", () => {
    mockSequence([]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Both FRAG_A and FRAG_B are in pool; dropping one over the other is a no-op
    triggerDragEnd(FRAG_A, FRAG_B);

    expect(placeMutate).not.toHaveBeenCalled();
    expect(moveMutate).not.toHaveBeenCalled();
    expect(unplaceMutate).not.toHaveBeenCalled();
  });

  it("does not call moveFragment when dropping a sequence tile onto itself", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Drop FRAG_A over itself → no-op
    triggerDragEnd(FRAG_A, FRAG_A);

    expect(moveMutate).not.toHaveBeenCalled();
  });
});
