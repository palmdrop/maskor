import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ImportPreviewResult } from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "project-uuid-1";

const importFile = new File(["# A\n\nbody"], "doc.md", { type: "text/markdown" });

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useNavigate: () => mockNavigate,
  useRouterState: () => ({ file: importFile }),
  useLocation: () => ({ hash: "" }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

vi.mock("@hooks/useProjectEditorConfig", () => ({
  useProjectEditorConfig: () => ({ fontSize: 16, maxParagraphWidth: 72 }),
}));

// Stub the shared renderer — exercised for real in readonly-prose.test.tsx.
vi.mock("@components/readonly-prose", () => ({
  ReadonlyProse: ({ content }: { content: string }) => <div data-testid="prose">{content}</div>,
}));

vi.mock("@lib/commands/useCommands", () => ({ useCommands: () => ({ run: vi.fn() }) }));
vi.mock("@lib/commands/useCommandScope", () => ({ useCommandScope: vi.fn() }));

vi.mock("@api/generated/fragments/fragments", () => ({
  usePreviewImportFragments: vi.fn(),
  useImportFragments: vi.fn(),
  getListFragmentsQueryKey: vi.fn(() => ["fragments", PROJECT_ID]),
  getListFragmentSummariesQueryKey: vi.fn(() => ["fragments", "summaries", PROJECT_ID]),
}));

const makeImportPreview = (overrides: Partial<ImportPreviewResult> = {}): ImportPreviewResult => ({
  markdown: "### 1. intro\n\nFirst.\n\n---\n\n### 2. body\n\nSecond.",
  sections: [
    {
      uuid: "",
      name: "",
      fragments: [
        { uuid: "1", key: "intro" },
        { uuid: "2", key: "body" },
      ],
    },
  ],
  ...overrides,
});

const { usePreviewImportFragments, useImportFragments } =
  await import("@api/generated/fragments/fragments");
const { FragmentImportPage } = await import("../FragmentImportPage");

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return wrapper;
};

describe("FragmentImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePreviewImportFragments as Mock).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ status: 200, data: makeImportPreview() }),
      isPending: false,
    });
    (useImportFragments as Mock).mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("lists pieces in the sidebar and renders the assembled markdown", async () => {
    render(<FragmentImportPage />, { wrapper: wrap() });
    expect(await screen.findByText("1. intro")).toBeInTheDocument();
    expect(screen.getByText("2. body")).toBeInTheDocument();
    expect(screen.getByTestId("prose").textContent).toContain("First.");
  });

  it("shows a non-blocking re-import warning when priorImport is present", async () => {
    (usePreviewImportFragments as Mock).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        status: 200,
        data: makeImportPreview({
          priorImport: {
            sequenceName: "Import: doc.md",
            importedAt: "2026-05-30T10:00:00.000Z",
          },
        }),
      }),
      isPending: false,
    });

    render(<FragmentImportPage />, { wrapper: wrap() });

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/already imported a file named/i);
    expect(banner.textContent).toContain("Import: doc.md");
    // Import remains enabled — the warning is advisory.
    const importButton = screen.getByRole("button", { name: /Import 2 fragments/i });
    expect(importButton).not.toBeDisabled();
  });

  it("does not show the warning when there is no priorImport", async () => {
    render(<FragmentImportPage />, { wrapper: wrap() });
    await screen.findByText("1. intro");
    expect(screen.queryByText(/already imported a file named/i)).not.toBeInTheDocument();
  });

  it("sidebar click scrolls to the piece anchor by id", async () => {
    const scrollIntoView = vi.fn();
    document.getElementById = vi.fn().mockImplementation((id) => {
      if (id === "fragment-2") return { scrollIntoView };
      return null;
    });

    render(<FragmentImportPage />, { wrapper: wrap() });
    fireEvent.click(await screen.findByText("2. body"));

    expect(document.getElementById).toHaveBeenCalledWith("fragment-2");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "fragment-2", replace: true }),
    );
  });
});
