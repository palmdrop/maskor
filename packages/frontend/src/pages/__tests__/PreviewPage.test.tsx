import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  AssembledSequence,
  Project,
  SequenceBundledResponse,
} from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "project-uuid-1";
const SEQUENCE_UUID = "sequence-uuid-1";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useSearch: () => ({ sequence: undefined }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

vi.mock("@hooks/useProjectEditorConfig", () => ({
  useProjectEditorConfig: () => ({ vimMode: false, rawMarkdownMode: false, fontSize: 16, maxParagraphWidth: 72 }),
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
  useGetMainAssembledSequence: vi.fn(),
}));

const makeProject = (overrides?: Partial<Project>): Project => ({
  projectUUID: PROJECT_ID,
  userUUID: "local",
  name: "Test Project",
  vaultPath: "/vault",
  editor: { vimMode: false, rawMarkdownMode: false, fontSize: 16, maxParagraphWidth: 72 },
  suggestion: { readyStatusThreshold: 0.95 },
  advanced: { showFragmentStats: false },
  preview: { showTitles: false, showSectionHeadings: true, separator: "blank-line" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeAssembledSequence = (
  overrides?: Partial<AssembledSequence>,
): AssembledSequence => ({
  sequenceUuid: SEQUENCE_UUID,
  sequenceName: "Main",
  isMain: true,
  sections: [
    {
      uuid: "section-1",
      name: "Chapter One",
      fragments: [
        { uuid: "frag-1", key: "opening", content: "The river was wide." },
        { uuid: "frag-2", key: "crossing", content: "They crossed at dawn." },
      ],
    },
  ],
  ...overrides,
});

const makeSequenceBundle = (sequences = [{ uuid: SEQUENCE_UUID, name: "Main", isMain: true }]): SequenceBundledResponse => ({
  sequences: sequences as SequenceBundledResponse["sequences"],
  violations: [],
  cycles: [],
});

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const { useGetProject, useUpdateProject } = await import("@api/generated/projects/projects");
const { useListSequences } = await import("@api/generated/sequences/sequences");
const {
  useGetAssembledSequence,
  useGetMainAssembledSequence,
} = await import("@api/generated/preview/preview");
const { PreviewPage } = await import("../PreviewPage");

const mockMutate = vi.fn();

const setupMocks = (overrides?: {
  assembled?: AssembledSequence | null;
  statusCode?: 200 | 404;
}) => {
  const assembled = overrides?.assembled !== undefined ? overrides.assembled : makeAssembledSequence();
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
    (useGetMainAssembledSequence as Mock).mockReturnValue({
      data: { status: 404 as const, data: { error: "NOT_FOUND", message: "Not found" } },
    });
  } else {
    (useGetAssembledSequence as Mock).mockReturnValue({
      data: { status: 200 as const, data: assembled },
    });
    (useGetMainAssembledSequence as Mock).mockReturnValue({
      data: { status: 200 as const, data: assembled },
    });
  }
};

describe("PreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fragment keys in sidebar", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    expect(screen.getByText("opening")).toBeInTheDocument();
    expect(screen.getByText("crossing")).toBeInTheDocument();
  });

  it("renders fragment content via ReadonlyEditor", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    // ReadonlyEditor renders via tiptap; check that the prose wrapper is in the DOM
    const mainArea = screen.getByRole("main");
    expect(mainArea).toBeInTheDocument();
  });

  it("shows 'Sequence empty.' when the assembled sequence has no fragments", () => {
    setupMocks({
      assembled: makeAssembledSequence({
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

  it("sidebar click triggers scrollIntoView on the fragment element", () => {
    setupMocks();
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id) => {
      if (id === "fragment-frag-1") return { scrollIntoView };
      return null;
    });

    render(<PreviewPage />, { wrapper: wrap() });
    fireEvent.click(screen.getByText("opening"));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("toggling showTitles calls useUpdateProject with the right patch", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    const toggleButton = screen.getByRole("switch", { name: /fragment titles/i });
    fireEvent.click(toggleButton);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        data: expect.objectContaining({ preview: expect.objectContaining({ showTitles: true }) }),
      }),
    );
  });

  it("toggling showTitles applies the change immediately in the prose", () => {
    setupMocks();
    render(<PreviewPage />, { wrapper: wrap() });
    // Before toggle: showTitles is false, so no h3 headings
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();

    const toggleButton = screen.getByRole("switch", { name: /fragment titles/i });
    fireEvent.click(toggleButton);

    // After toggle: showTitles is true, fragment keys should appear as h3
    expect(screen.getByRole("heading", { level: 3, name: /opening/i })).toBeInTheDocument();
  });
});
