import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { VaultWarning } from "@api/generated/maskorAPI.schemas";
import type * as ReactQuery from "@tanstack/react-query";

const PROJECT_ID = "proj-1";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactQuery>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

const dismissMutateAsync = vi.fn(() => Promise.resolve({ status: 200, data: [] }));
let listedWarnings: VaultWarning[] = [];

vi.mock("@api/generated/warnings/warnings", () => ({
  useListWarnings: vi.fn(() => ({
    data: { status: 200, data: listedWarnings },
    isLoading: false,
  })),
  useDismissWarning: vi.fn(() => ({ mutateAsync: dismissMutateAsync, isPending: false })),
  getListWarningsQueryKey: vi.fn(() => []),
}));

import { DiagnosticsTab } from "../DiagnosticsTab";

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const wrongFormat: VaultWarning = {
  id: "w1",
  category: "state",
  createdAt: "2026-05-29T00:00:00.000Z",
  kind: "WRONG_FORMAT_FILE",
  filePath: "fragments/imported.docx",
};

const unknownAspect: VaultWarning = {
  id: "w2",
  category: "state",
  createdAt: "2026-05-29T00:00:00.000Z",
  kind: "UNKNOWN_ASPECT_KEY",
  aspectKey: "phantom",
  fragmentUuids: ["f1", "f2"],
};

const collision: VaultWarning = {
  id: "w3",
  category: "event",
  createdAt: "2026-05-29T00:00:00.000Z",
  kind: "UUID_COLLISION",
  filePath: "fragments/duplicate.md",
  collidingPath: "fragments/original.md",
  newUuid: "uuid-new",
};

beforeEach(() => {
  vi.clearAllMocks();
  listedWarnings = [];
});

describe("DiagnosticsTab", () => {
  it("shows a healthy message when there are no warnings", () => {
    listedWarnings = [];
    wrap(<DiagnosticsTab projectId={PROJECT_ID} />);
    expect(screen.getByText(/vault is healthy/i)).toBeInTheDocument();
  });

  it("renders warnings grouped by kind with their context", () => {
    listedWarnings = [wrongFormat, unknownAspect, collision];
    wrap(<DiagnosticsTab projectId={PROJECT_ID} />);

    expect(screen.getByText(/Wrong-format files/i)).toBeInTheDocument();
    expect(screen.getByText("fragments/imported.docx")).toBeInTheDocument();
    expect(screen.getByText(/Unknown aspect keys/i)).toBeInTheDocument();
    expect(screen.getByText("phantom")).toBeInTheDocument();
    expect(screen.getByText(/UUID collisions/i)).toBeInTheDocument();
    expect(screen.getByText("fragments/duplicate.md")).toBeInTheDocument();
  });

  it("shows a Dismiss button only for event warnings", () => {
    listedWarnings = [wrongFormat, unknownAspect, collision];
    wrap(<DiagnosticsTab projectId={PROJECT_ID} />);

    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    expect(dismissButtons).toHaveLength(1);
  });

  it("dismisses an event warning by id when its Dismiss button is clicked", async () => {
    listedWarnings = [collision];
    wrap(<DiagnosticsTab projectId={PROJECT_ID} />);

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() =>
      expect(dismissMutateAsync).toHaveBeenCalledWith({ projectId: PROJECT_ID, id: "w3" }),
    );
  });
});
