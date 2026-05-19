import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type * as DndKitCore from "@dnd-kit/core";
import type * as DndKitSortable from "@dnd-kit/sortable";
import type { OverviewDensity } from "../../router";

// --- router mock ---

let currentSearch: { sequence?: string; density: OverviewDensity } = {
  sequence: undefined,
  density: "full",
};
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
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
  useListSequences: vi.fn(() => ({ data: undefined, isLoading: false })),
  usePlaceFragment: vi.fn(() => ({ mutate: placeMutate })),
  useMoveFragment: vi.fn(() => ({ mutate: moveMutate })),
  useUnplaceFragment: vi.fn(() => ({ mutate: unplaceMutate })),
  useDesignateSequenceMain: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRenameSection: vi.fn(() => ({ mutate: vi.fn() })),
  useDeleteSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateSequence: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useDeleteSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListSequencesQueryKey: (projectId: string) => [`/projects/${projectId}/sequences`],
}));

vi.mock("../../api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: vi.fn(),
}));

vi.mock("../../api/generated/aspects/aspects", () => ({
  useListAspects: vi.fn(() => ({ data: { status: 200, data: [] }, isLoading: false })),
}));

// --- test data ---

const PROJECT_ID = "proj-1";
const SEQUENCE_UUID = "seq-1";
const SECTION_UUID = "sec-1";
const FRAG_A = "frag-aaa";
const FRAG_B = "frag-bbb";
const FRAG_C = "frag-ccc";

const makeBundleResponse = (fragmentUuids: string[] = []) => ({
  status: 200 as const,
  data: {
    sequences: [
      {
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
    ],
    violations: [],
    cycles: [],
  },
});

const makeFragment = (
  uuid: string,
  key: string,
  excerpt: string | null = "Some text content here.",
  aspects: Record<string, { weight: number }> = {},
) => ({
  uuid,
  key,
  isDiscarded: false,
  excerpt,
  aspects,
});

const makeFragmentsResponse = (fragments: ReturnType<typeof makeFragment>[]) => ({
  status: 200 as const,
  data: fragments,
});

// --- helpers ---

const { useListSequences } = await import("../../api/generated/sequences/sequences");
const { useListFragmentSummaries } = await import("../../api/generated/fragments/fragments");

const mockSequence = (fragmentUuids: string[] = []) => {
  (useListSequences as Mock).mockReturnValue({
    data: makeBundleResponse(fragmentUuids),
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
    currentSearch = { sequence: undefined, density: "full" };
  });

  it("shows loading state while data is fetching", () => {
    (useListSequences as Mock).mockReturnValue({ data: undefined, isLoading: true });
    (useListFragmentSummaries as Mock).mockReturnValue({ data: undefined, isLoading: true });

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders section and Pool headings", () => {
    mockSequence([]);
    mockFragments([]);

    render(<OverviewPage />, { wrapper: wrap() });

    const headings = screen.getAllByRole("heading", { level: 2 });
    // section heading uses the section name (e.g. "Main") or "Untitled section"
    expect(headings.length).toBeGreaterThan(0);
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

    // Pool count is in the <h2> for the pool section
    const headings = screen.getAllByRole("heading", { level: 2 });
    const poolHeading = headings.find((h) => /pool/i.test(h.textContent ?? ""));
    // section has 1 placed fragment; pool has 1 unplaced
    expect(poolHeading?.textContent).toMatch(/\(1\)/);
    expect(poolHeading?.textContent).toMatch(/\(1\)/);
  });
});

describe("OverviewPage — drag interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
    currentSearch = { sequence: undefined, density: "full" };
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

  it("calls placeFragment at tail when dropped onto the section zone container", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha"), makeFragment(FRAG_B, "beta")]);

    render(<OverviewPage />, { wrapper: wrap() });

    // Drop FRAG_B onto the section zone itself (zone id = section UUID) → append
    triggerDragEnd(FRAG_B, SECTION_UUID);

    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_UUID,
      data: {
        fragmentUuid: FRAG_B,
        sectionUuid: SECTION_UUID,
        position: 1, // section has 1 item → append at index 1
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

describe("OverviewPage — density toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
    currentSearch = { sequence: undefined, density: "full" };
    mockSequence([]);
    mockFragments([]);
  });

  it("renders all three density tier buttons", () => {
    render(<OverviewPage />, { wrapper: wrap() });

    const group = screen.getByRole("group", { name: /tile density/i });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent?.toLowerCase()).toBe("full");
    expect(buttons[1]?.textContent?.toLowerCase()).toBe("compact");
    expect(buttons[2]?.textContent?.toLowerCase()).toBe("mini");
  });

  it("marks 'full' active by default", () => {
    render(<OverviewPage />, { wrapper: wrap() });

    const fullButton = screen.getByRole("button", { name: /^full$/i });
    expect(fullButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects the density URL param in the active button", () => {
    currentSearch = { sequence: undefined, density: "compact" };
    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByRole("button", { name: /^full$/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: /^compact$/i }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: /^mini$/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("calls navigate with updated density when a tier button is clicked", () => {
    currentSearch = { sequence: "seq-existing", density: "full" };
    render(<OverviewPage />, { wrapper: wrap() });

    fireEvent.click(screen.getByRole("button", { name: /^mini$/i }));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const navigateCall = navigateMock.mock.calls[0][0];
    expect(navigateCall.to).toBe("/projects/$projectId/overview");
    expect(navigateCall.params).toEqual({ projectId: PROJECT_ID });
    // search is a function that merges into previous params
    expect(typeof navigateCall.search).toBe("function");
    const previousSearch = { sequence: "seq-existing", density: "full" as const };
    expect(navigateCall.search(previousSearch)).toEqual({
      sequence: "seq-existing",
      density: "mini",
    });
  });
});

describe("OverviewPage — density-aware tile rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
    currentSearch = { sequence: undefined, density: "full" };
  });

  it("renders fragment excerpt and aspect chips when density is full", () => {
    currentSearch = { sequence: undefined, density: "full" };
    mockSequence([]);
    mockFragments([
      makeFragment(FRAG_A, "alpha", "This is the excerpt for alpha.", {
        grief: { weight: 0.6 },
        city: { weight: 0.3 },
      }),
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText("This is the excerpt for alpha.")).toBeInTheDocument();
    expect(screen.getByText("grief")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
  });

  it("hides excerpt and shows a color bar when density is compact", () => {
    currentSearch = { sequence: undefined, density: "compact" };
    mockSequence([]);
    mockFragments([
      makeFragment(FRAG_A, "alpha", "This excerpt should not be rendered.", {
        grief: { weight: 0.6 },
      }),
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("This excerpt should not be rendered.")).not.toBeInTheDocument();

    const compactTile = document.querySelector('[data-density="compact"]');
    expect(compactTile).not.toBeNull();
    expect(compactTile?.querySelector('[data-aspect-key="grief"]')).not.toBeNull();
  });

  it("renders only the color bar (no key text) when density is mini", () => {
    currentSearch = { sequence: undefined, density: "mini" };
    mockSequence([]);
    mockFragments([
      makeFragment(FRAG_A, "alpha", "Hidden excerpt.", {
        grief: { weight: 0.6 },
        city: { weight: 0.4 },
      }),
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    // No visible key or excerpt at mini.
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden excerpt.")).not.toBeInTheDocument();

    const miniTile = document.querySelector('[data-density="mini"]');
    expect(miniTile).not.toBeNull();
    expect(miniTile?.getAttribute("aria-label")).toBe("alpha");
    expect(miniTile?.querySelector('[data-aspect-key="grief"]')).not.toBeNull();
    expect(miniTile?.querySelector('[data-aspect-key="city"]')).not.toBeNull();
  });

  it("renders an empty color bar fallback for fragments with no aspect weights", () => {
    currentSearch = { sequence: undefined, density: "mini" };
    mockSequence([]);
    mockFragments([makeFragment(FRAG_A, "alpha", null, {})]);

    render(<OverviewPage />, { wrapper: wrap() });

    const miniTile = document.querySelector('[data-density="mini"]');
    expect(miniTile).not.toBeNull();
    // No aspect segments are rendered when there are no weights.
    expect(miniTile?.querySelector("[data-aspect-key]")).toBeNull();
  });
});

describe("OverviewPage — arc panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDragEnd = undefined;
    currentSearch = { sequence: undefined, density: "full" };
  });

  it("does not render the arc panel when the sequence has no sections", () => {
    (useListSequences as Mock).mockReturnValue({
      data: { status: 200, data: { sequences: [], violations: [], cycles: [] } },
      isLoading: false,
    });
    mockFragments([]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.queryByTestId("arc-panel")).toBeNull();
  });

  it("renders the arc panel when sections exist, even if empty", () => {
    mockSequence([]);
    mockFragments([]);

    render(<OverviewPage />, { wrapper: wrap() });

    expect(screen.getByTestId("arc-panel")).toBeInTheDocument();
  });

  it("renders one curve per aspect that has any weighted point", () => {
    mockSequence([FRAG_A, FRAG_B]);
    mockFragments([
      makeFragment(FRAG_A, "alpha", null, { grief: { weight: 0.6 }, city: { weight: 0.3 } }),
      makeFragment(FRAG_B, "beta", null, { grief: { weight: 0.8 } }),
    ]);

    render(<OverviewPage />, { wrapper: wrap() });

    const panel = screen.getByTestId("arc-panel");
    expect(panel.querySelector('[data-aspect-key="grief"]')).not.toBeNull();
    // city has only one point — renders as a circle, also tagged with data-aspect-key
    expect(panel.querySelector('[data-aspect-key="city"]')).not.toBeNull();
  });

  it("omits an aspect when no placed fragment has weight for it", () => {
    mockSequence([FRAG_A]);
    mockFragments([makeFragment(FRAG_A, "alpha", null, { grief: { weight: 0.6 } })]);

    render(<OverviewPage />, { wrapper: wrap() });

    const panel = screen.getByTestId("arc-panel");
    expect(panel.querySelector('[data-aspect-key="grief"]')).not.toBeNull();
    expect(panel.querySelector('[data-aspect-key="city"]')).toBeNull();
  });
});

describe("parseOverviewDensity", () => {
  it("returns 'full' as the default when value is undefined", async () => {
    const { parseOverviewDensity } = await import("../../router");
    expect(parseOverviewDensity(undefined)).toBe("full");
  });

  it("returns 'full' for unknown string values", async () => {
    const { parseOverviewDensity } = await import("../../router");
    expect(parseOverviewDensity("bogus")).toBe("full");
    expect(parseOverviewDensity("")).toBe("full");
  });

  it("returns the value when it is a valid density tier", async () => {
    const { parseOverviewDensity } = await import("../../router");
    expect(parseOverviewDensity("full")).toBe("full");
    expect(parseOverviewDensity("compact")).toBe("compact");
    expect(parseOverviewDensity("mini")).toBe("mini");
  });

  it("returns 'full' for non-string inputs", async () => {
    const { parseOverviewDensity } = await import("../../router");
    expect(parseOverviewDensity(null)).toBe("full");
    expect(parseOverviewDensity(42)).toBe("full");
    expect(parseOverviewDensity({})).toBe("full");
  });
});
