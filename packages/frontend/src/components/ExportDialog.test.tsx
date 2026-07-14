import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { exportMock, updateProjectMock, projectState } = vi.hoisted(() => ({
  exportMock: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, data: undefined },
  // useProjectSetting commits via mutateAsync (awaited), not fire-and-forget mutate.
  updateProjectMock: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: false },
  projectState: {
    export: { includeReferences: true, includeMarginAnnotations: true },
  },
}));

vi.mock("@api/generated/export/export", () => ({
  useExportSequence: () => exportMock,
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
  projectState.export = { includeReferences: true, includeMarginAnnotations: true };
  // jsdom lacks object-URL support used by the download trigger.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("ExportDialog", () => {
  it("seeds the annotation toggles from the project export config", () => {
    projectState.export = { includeReferences: false, includeMarginAnnotations: true };
    renderDialog();

    expect(screen.getByRole("checkbox", { name: "Include references" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include margin annotations" })).toBeChecked();
  });

  it("persists a toggle change via the project update mutation", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Include references" }));

    expect(updateProjectMock.mutateAsync).toHaveBeenCalledWith({
      projectId: "proj-uuid",
      data: { export: { includeReferences: false } },
    });
  });

  it("sends the current toggle state with the export request", () => {
    projectState.export = { includeReferences: false, includeMarginAnnotations: true };
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(exportMock.mutate).toHaveBeenCalledWith(
      {
        projectId: "proj-uuid",
        sequenceId: "main-uuid",
        data: { format: "md", includeReferences: false, includeMarginAnnotations: true },
      },
      expect.anything(),
    );
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
