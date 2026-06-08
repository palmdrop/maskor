import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  PreviewResult,
  Project,
  SequenceBundledResponse,
} from "@api/generated/maskorAPI.schemas";
import { anchorSentinel } from "@maskor/shared/sentinel";

const PROJECT_ID = "project-uuid-1";
const SEQUENCE_UUID = "sequence-uuid-1";

const mockNavigate = vi.fn();
// Mutable so tests can simulate landing on a `#fragment-…` deep link.
const mockLocation = { hash: "" };

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useSearch: () => ({ sequence: undefined }),
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

vi.mock("@hooks/useProjectEditorConfig", () => ({
  useProjectEditorConfig: () => ({
    vimMode: false,
    rawMarkdownMode: false,
    fontSize: 16,
    maxParagraphWidth: 72,
    vimClipboardSync: true,
  }),
}));

// The shared renderer is a real Tiptap instance, exercised in
// readonly-prose.test.tsx. Here we stub it to a plain element so the page test
// stays focused on wiring (sidebar, toggles, refetch) and deterministic.
vi.mock("@components/readonly-prose", () => ({
  ReadonlyProse: ({ content }: { content: string }) => <div data-testid="prose">{content}</div>,
}));

vi.mock("@api/generated/projects/projects", () => ({
  useGetProject: vi.fn(),
  useUpdateProject: vi.fn(),
  getGetProjectQueryKey: vi.fn(() => ["projects", PROJECT_ID]),
}));

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: vi.fn(),
}));

vi.mock("@api/generated/preview/preview", () => ({
  useGetAssembledSequence: vi.fn(),
  getGetAssembledSequenceQueryKey: vi.fn(() => ["assembled", "preview"]),
}));

vi.mock("@api/generated/fragments/fragments", () => ({
  useGetFragment: vi.fn(),
  useUpdateFragment: vi.fn(),
  getGetFragmentQueryKey: vi.fn((projectId: string, fragmentId: string) => [
    "fragment",
    projectId,
    fragmentId,
  ]),
}));

// Capture the last onSave/onCancel so tests can drive the editor.
let capturedEditorOnSave: ((content: string) => void) | undefined;
let capturedEditorOnCancel: (() => void) | undefined;

vi.mock("@components/inline-fragment-editor", () => ({
  InlineFragmentEditor: ({
    content,
    onSave,
    onCancel,
  }: {
    projectId: string;
    content: string;
    onSave: (content: string) => void;
    onCancel: () => void;
    isSaving: boolean;
  }) => {
    capturedEditorOnSave = onSave;
    capturedEditorOnCancel = onCancel;
    return (
      <div data-testid="inline-fragment-editor" data-content={content}>
        <button type="button" onClick={() => onSave(content)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

const makeProject = (overrides?: Partial<Project>): Project => ({
  projectUUID: PROJECT_ID,
  userUUID: "local",
  name: "Test Project",
  vaultPath: "/vault",
  editor: {
    vimMode: false,
    rawMarkdownMode: false,
    fontSize: 16,
    maxParagraphWidth: 72,
    vimClipboardSync: true,
  },
  suggestion: { readinessThreshold: 0.95 },
  advanced: { showFragmentStats: false },
  preview: { showTitles: false, showSectionHeadings: true, separator: "blank-line" },
  overview: { detailLevel: "prose" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makePreviewResult = (overrides?: Partial<PreviewResult>): PreviewResult => ({
  markdown: "## Chapter One\n\nThe river was wide.\n\nThey crossed at dawn.",
  sections: [
    {
      uuid: "section-1",
      name: "Chapter One",
      fragments: [
        { uuid: "frag-1", key: "opening" },
        { uuid: "frag-2", key: "crossing" },
      ],
    },
  ],
  ...overrides,
});

const makeSequenceBundle = (
  sequences = [{ uuid: SEQUENCE_UUID, name: "Main", isMain: true }],
): SequenceBundledResponse => ({
  sequences: sequences as SequenceBundledResponse["sequences"],
  violations: [],
  cycles: [],
});

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

const { useGetProject, useUpdateProject } = await import("@api/generated/projects/projects");
const { useListSequences } = await import("@api/generated/sequences/sequences");
const { useGetAssembledSequence } = await import("@api/generated/preview/preview");
const { useGetFragment, useUpdateFragment } = await import("@api/generated/fragments/fragments");
const { PreviewPage } = await import("../PreviewPage");

const mockMutate = vi.fn();
const mockUpdateFragment = vi.fn().mockResolvedValue({ status: 200, data: {} });

const setupMocks = (overrides?: { assembled?: PreviewResult | null; statusCode?: 200 | 404 }) => {
  const assembled = overrides?.assembled !== undefined ? overrides.assembled : makePreviewResult();
  const statusCode = overrides?.statusCode ?? 200;

  (useGetProject as Mock).mockReturnValue({
    data: { status: 200 as const, data: makeProject() },
  });
  (useUpdateProject as Mock).mockReturnValue({ mutate: mockMutate });
  (useListSequences as Mock).mockReturnValue({
    data: { status: 200 as const, data: makeSequenceBundle() },
  });

  if (statusCode === 404 || assembled === null) {
    (useGetAssembledSequence as Mock).mockReturnValue({
      data: { status: 404 as const, data: { error: "NOT_FOUND", message: "Not found" } },
    });
  } else {
    (useGetAssembledSequence as Mock).mockReturnValue({
      data: { status: 200 as const, data: assembled },
    });
  }

  // Fragment hooks default to no data; override per-test as needed.
  (useGetFragment as Mock).mockReturnValue({ data: undefined });
  (useUpdateFragment as Mock).mockReturnValue({ mutateAsync: mockUpdateFragment });
};

// The toggle params the page passed on its most recent render.
const lastQueryParams = () => (useGetAssembledSequence as Mock).mock.calls.at(-1)?.[2];

describe("PreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.hash = "";
    capturedEditorOnSave = undefined;
    capturedEditorOnCancel = undefined;
  });

  it("renders fragment keys in the sidebar", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    expect(screen.getByText("opening")).toBeInTheDocument();
    expect(screen.getByText("crossing")).toBeInTheDocument();
  });

  it("renders the assembled markdown via the shared renderer", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    expect(screen.getByTestId("prose").textContent).toContain("The river was wide.");
  });

  it("shows 'Sequence empty.' when the assembled sequence has no fragments", () => {
    setupMocks({
      assembled: makePreviewResult({
        markdown: "",
        sections: [{ uuid: "sec-1", name: "Empty", fragments: [] }],
      }),
    });
    render(<PreviewPage />, { wrapper: wrap() });
    expect(screen.getByText("Sequence empty.")).toBeInTheDocument();
  });

  it("shows 'This sequence no longer exists.' on 404", () => {
    setupMocks({ statusCode: 404 });
    render(<PreviewPage />, { wrapper: wrap() });
    expect(screen.getByText("This sequence no longer exists.")).toBeInTheDocument();
  });

  it("sidebar click sets the fragment hash and scrolls to the anchor element", () => {
    setupMocks();
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id) => {
      if (id === "fragment-frag-1") return { scrollIntoView };
      return null;
    });

    render(<PreviewPage />, { wrapper: wrap() });
    fireEvent.click(screen.getByText("opening"));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "fragment-frag-1", replace: true }),
    );
  });

  it("scrolls to the fragment named in the URL hash once content is ready", () => {
    setupMocks();
    mockLocation.hash = "fragment-frag-2";
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id) => {
      if (id === "fragment-frag-2") return { scrollIntoView };
      return null;
    });

    render(<PreviewPage />, { wrapper: wrap() });

    expect(document.getElementById).toHaveBeenCalledWith("fragment-frag-2");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("persists a toggle change via useUpdateProject", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    fireEvent.click(screen.getByRole("switch", { name: /fragment titles/i }));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        data: expect.objectContaining({ preview: expect.objectContaining({ showTitles: true }) }),
      }),
    );
  });

  it("flipping a toggle refetches with the new option sent to the endpoint", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    expect(lastQueryParams()).toMatchObject({ showTitles: "false", separator: "blank-line" });

    fireEvent.click(screen.getByRole("switch", { name: /fragment titles/i }));
    // The page re-renders with the optimistic override and requests re-assembly
    // with titles on.
    expect(lastQueryParams()).toMatchObject({ showTitles: "true" });
  });

  it("reverts the requested option when the persist mutation fails", () => {
    let capturedOnError: (() => void) | undefined;
    (useGetProject as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeProject() },
    });
    (useUpdateProject as Mock).mockImplementation((options) => {
      capturedOnError = options?.mutation?.onError;
      return { mutate: mockMutate };
    });
    (useListSequences as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeSequenceBundle() },
    });
    (useGetAssembledSequence as Mock).mockReturnValue({
      data: { status: 200 as const, data: makePreviewResult() },
    });

    render(<PreviewPage />, { wrapper: wrap() });

    fireEvent.click(screen.getByRole("switch", { name: /fragment titles/i }));
    expect(lastQueryParams()).toMatchObject({ showTitles: "true" });

    expect(capturedOnError).toBeDefined();
    act(() => {
      capturedOnError!();
    });

    expect(lastQueryParams()).toMatchObject({ showTitles: "false" });
  });
});

// --- Helpers for inline editing tests ---

// Assembled markdown with sentinel tokens for two fragments.
const makeAssembledWithSentinels = (): PreviewResult => ({
  markdown: [
    anchorSentinel("frag-1"),
    "First fragment body.",
    "",
    anchorSentinel("frag-2"),
    "Second fragment body.",
  ].join("\n"),
  sections: [
    {
      uuid: "section-1",
      name: "",
      fragments: [
        { uuid: "frag-1", key: "opening" },
        { uuid: "frag-2", key: "crossing" },
      ],
    },
  ],
});

const makeFragmentData = (uuid: string, content: string) => ({
  uuid,
  key: "opening",
  content,
  readiness: 0,
  contentHash: "",
  references: [],
  isDiscarded: false,
  aspects: {},
  updatedAt: "",
});

// Inject a `.fragment-anchor` element into the main element so double-click
// resolution can find a preceding anchor (simulates what ReadonlyProse renders).
const injectFragmentAnchor = (main: Element, uuid: string): HTMLDivElement => {
  const anchor = document.createElement("div");
  anchor.className = "fragment-anchor";
  anchor.id = `fragment-${uuid}`;
  main.appendChild(anchor);
  return anchor;
};

describe("PreviewPage — inline editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.hash = "";
    capturedEditorOnSave = undefined;
    capturedEditorOnCancel = undefined;
  });

  it("double-click on content after a fragment anchor resolves the correct uuid and opens the editor", () => {
    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "raw body of frag-1") },
    });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;

    const anchor = injectFragmentAnchor(main, "frag-1");
    const textNode = document.createElement("p");
    textNode.textContent = "paragraph after frag-1";
    main.appendChild(textNode);

    // Sanity-check: the text node follows the anchor in document order.
    expect(
      anchor.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.doubleClick(textNode);

    expect(screen.getByTestId("inline-fragment-editor")).toBeInTheDocument();
    expect(screen.getByTestId("inline-fragment-editor")).toHaveAttribute(
      "data-content",
      "raw body of frag-1",
    );
  });

  it("double-click before any anchor resolves to nothing and does not open the editor", () => {
    setupMocks();

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;

    // No anchors injected — double-click before any anchor → no editor.
    fireEvent.doubleClick(main);

    expect(screen.queryByTestId("inline-fragment-editor")).not.toBeInTheDocument();
  });

  it("cancel closes the editor", async () => {
    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "raw body") },
    });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;
    injectFragmentAnchor(main, "frag-1");
    const textNode = document.createElement("p");
    main.appendChild(textNode);

    fireEvent.doubleClick(textNode);
    expect(screen.getByTestId("inline-fragment-editor")).toBeInTheDocument();

    await act(async () => {
      capturedEditorOnCancel?.();
    });

    expect(screen.queryByTestId("inline-fragment-editor")).not.toBeInTheDocument();
  });

  it("save calls updateFragment with the correct fragment id and new content", async () => {
    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "original") },
    });
    (useUpdateFragment as Mock).mockReturnValue({ mutateAsync: mockUpdateFragment });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;
    injectFragmentAnchor(main, "frag-1");
    const textNode = document.createElement("p");
    main.appendChild(textNode);

    fireEvent.doubleClick(textNode);

    await act(async () => {
      capturedEditorOnSave?.("updated content");
    });

    expect(mockUpdateFragment).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        fragmentId: "frag-1",
        data: { content: "updated content" },
      }),
    );
  });

  it("a second double-click is blocked while an editor is open", () => {
    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "body") },
    });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;
    injectFragmentAnchor(main, "frag-1");
    const target1 = document.createElement("p");
    main.appendChild(target1);
    injectFragmentAnchor(main, "frag-2");
    const target2 = document.createElement("p");
    main.appendChild(target2);

    fireEvent.doubleClick(target1);
    expect(screen.getByTestId("inline-fragment-editor")).toBeInTheDocument();

    // Second double-click while editor is open — should not open a new one.
    fireEvent.doubleClick(target2);
    expect(screen.getAllByTestId("inline-fragment-editor")).toHaveLength(1);
  });

  it("save scrolls to the saved fragment's anchor once the editor closes", async () => {
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id: string) => {
      if (id === "fragment-frag-1") return { scrollIntoView };
      return null;
    });

    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "original") },
    });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;
    injectFragmentAnchor(main, "frag-1");
    const textNode = document.createElement("p");
    main.appendChild(textNode);

    fireEvent.doubleClick(textNode);

    await act(async () => {
      await capturedEditorOnSave?.("new content");
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("cancel scrolls back to the fragment anchor", async () => {
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id: string) => {
      if (id === "fragment-frag-1") return { scrollIntoView };
      return null;
    });

    setupMocks({ assembled: makeAssembledWithSentinels() });
    (useGetFragment as Mock).mockReturnValue({
      data: { status: 200 as const, data: makeFragmentData("frag-1", "body") },
    });

    const { container } = render(<PreviewPage />, { wrapper: wrap() });
    const main = container.querySelector("main")!;
    injectFragmentAnchor(main, "frag-1");
    const textNode = document.createElement("p");
    main.appendChild(textNode);

    fireEvent.doubleClick(textNode);
    expect(screen.getByTestId("inline-fragment-editor")).toBeInTheDocument();

    await act(async () => {
      capturedEditorOnCancel?.();
    });

    expect(screen.queryByTestId("inline-fragment-editor")).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });
});
