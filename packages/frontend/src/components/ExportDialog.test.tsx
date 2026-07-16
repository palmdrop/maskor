import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { exportMock, updateProjectMock, projectState, annotationSummaryState } = vi.hoisted(() => ({
  exportMock: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, data: undefined },
  // useProjectSetting commits via mutateAsync (awaited), not fire-and-forget mutate.
  updateProjectMock: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: false },
  projectState: {
    export: {
      includeReferences: true,
      includeMarginAnnotations: true,
      showTitles: false,
      showSectionHeadings: true,
      separator: "blank-line",
    },
  },
  annotationSummaryState: {
    summary: { referenceCount: 3, commentCount: 4, noteCount: 2, orphanedCommentCount: 0 },
  },
}));

vi.mock("@api/generated/export/export", () => ({
  useExportSequence: () => exportMock,
  useGetExportAnnotationSummary: () => ({
    data: { status: 200, data: annotationSummaryState.summary },
  }),
}));

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: () => ({
    data: {
      status: 200,
      data: { sequences: [{ uuid: "main-uuid", name: "Main", isMain: true }] },
    },
  }),
}));

vi.mock("@api/generated/projects/projects", () => ({
  useGetProject: () => ({
    data: { status: 200, data: { projectUUID: "proj-uuid", export: projectState.export } },
  }),
  useUpdateProject: () => updateProjectMock,
  getGetProjectQueryKey: () => ["projects", "proj-uuid"],
  getListProjectsQueryKey: () => ["projects", "list"],
}));

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

import { ExportDialog } from "./ExportDialog";
import { toast } from "sonner";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const renderDialog = () =>
  render(<ExportDialog open={true} onOpenChange={vi.fn()} projectId="proj-uuid" />, {
    wrapper: Wrapper,
  });

beforeEach(() => {
  exportMock.mutate.mockReset();
  exportMock.reset.mockReset();
  updateProjectMock.mutateAsync.mockReset();
  updateProjectMock.mutateAsync.mockResolvedValue(undefined);
  (toast.warning as ReturnType<typeof vi.fn>).mockReset();
  projectState.export = {
    includeReferences: true,
    includeMarginAnnotations: true,
    showTitles: false,
    showSectionHeadings: true,
    separator: "blank-line",
  };
  annotationSummaryState.summary = {
    referenceCount: 3,
    commentCount: 4,
    noteCount: 2,
    orphanedCommentCount: 0,
  };
  // jsdom lacks object-URL support used by the download trigger.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("ExportDialog", () => {
  it("seeds the toggles from the project export config", () => {
    projectState.export = {
      includeReferences: false,
      includeMarginAnnotations: true,
      showTitles: true,
      showSectionHeadings: false,
      separator: "blank-line",
    };
    renderDialog();

    expect(screen.getByRole("checkbox", { name: "Include references" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include margin annotations" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Fragment titles" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Section headings" })).not.toBeChecked();
  });

  it("persists a toggle change via the project update mutation", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Include references" }));

    expect(updateProjectMock.mutateAsync).toHaveBeenCalledWith({
      projectId: "proj-uuid",
      data: { export: { includeReferences: false } },
    });
  });

  it("persists an assembly-option change via the project update mutation", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Fragment titles" }));

    expect(updateProjectMock.mutateAsync).toHaveBeenCalledWith({
      projectId: "proj-uuid",
      data: { export: { showTitles: true } },
    });
  });

  it("sends the current option state with the export request", () => {
    projectState.export = {
      includeReferences: false,
      includeMarginAnnotations: true,
      showTitles: true,
      showSectionHeadings: false,
      separator: "page-break",
    };
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(exportMock.mutate).toHaveBeenCalledWith(
      {
        projectId: "proj-uuid",
        sequenceId: "main-uuid",
        data: {
          format: "md",
          includeReferences: false,
          includeMarginAnnotations: true,
          showTitles: true,
          showSectionHeadings: false,
          separator: "page-break",
        },
      },
      expect.anything(),
    );
  });

  it("shows the annotation counts that will be added", () => {
    renderDialog();

    expect(screen.getByText("3 references will be added as footnotes.")).toBeInTheDocument();
    expect(
      screen.getByText("4 comments and 2 notes will be added from the Margin."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/orphaned/)).not.toBeInTheDocument();
  });

  it("warns about orphaned comments that will be skipped", () => {
    annotationSummaryState.summary = {
      referenceCount: 0,
      commentCount: 1,
      noteCount: 0,
      orphanedCommentCount: 1,
    };
    renderDialog();

    expect(screen.getByText("1 orphaned comment will be skipped.")).toBeInTheDocument();
  });

  it("hides count lines whose toggle is off", () => {
    projectState.export = {
      includeReferences: false,
      includeMarginAnnotations: true,
      showTitles: false,
      showSectionHeadings: true,
      separator: "blank-line",
    };
    renderDialog();

    expect(screen.queryByText(/footnotes/)).not.toBeInTheDocument();
    expect(
      screen.getByText("4 comments and 2 notes will be added from the Margin."),
    ).toBeInTheDocument();
  });

  it("surfaces orphaned-comment warnings from the response header as a toast", async () => {
    const warnings = [{ fragmentKey: "chapter-one", count: 2 }];
    const headers = new Headers({
      "content-disposition": 'attachment; filename="export.md"',
      "X-Maskor-Export-Warnings": encodeURIComponent(JSON.stringify(warnings)),
    });
    exportMock.mutate.mockImplementation(
      (_vars: unknown, options: { onSuccess: (response: unknown) => void }) => {
        options.onSuccess({ status: 200, data: new Blob(["x"]), headers });
      },
    );

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("chapter-one (2)"));
    });
  });
});
