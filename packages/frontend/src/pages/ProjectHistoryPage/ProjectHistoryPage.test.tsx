import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LogEntry } from "@maskor/shared";

const commandError: LogEntry = {
  id: "e1",
  timestamp: "2026-01-01T10:00:00Z",
  correlationId: "corr-1",
  type: "command:error",
  actor: "system",
  undoable: false,
  payload: {
    commandId: "editor:save",
    friendlyMessage: "Save failed.",
    technicalMessage: "Network error",
  },
};

const created: LogEntry = {
  id: "e2",
  timestamp: "2026-01-01T10:01:00Z",
  correlationId: "corr-2",
  type: "fragment:created",
  actor: "user",
  undoable: false,
  target: { type: "fragment", uuid: "u1", key: "frag-1" },
  payload: {},
};

vi.mock("@tanstack/react-router", () => ({ useParams: () => ({ projectId: "p1" }) }));
vi.mock("@api/action-log", () => ({
  useActionLog: () => ({
    data: { status: 200, data: [commandError, created] },
    isLoading: false,
    isError: false,
  }),
}));
const emptyList = () => ({ data: { status: 200, data: [] } });
vi.mock("@api/generated/fragments/fragments", () => ({ useListFragments: emptyList }));
vi.mock("@api/generated/aspects/aspects", () => ({ useListAspects: emptyList }));
vi.mock("@api/generated/notes/notes", () => ({ useListNotes: emptyList }));
vi.mock("@api/generated/references/references", () => ({ useListReferences: emptyList }));

const { ProjectHistoryPage } = await import("./index");

describe("ProjectHistoryPage", () => {
  it("renders a command:error entry as a failure row with friendly message and details", () => {
    render(<ProjectHistoryPage />);
    expect(screen.getByText("Save failed.")).toBeInTheDocument();
    // Details disclosure carries commandId, correlationId, technicalMessage.
    expect(screen.getByText("editor:save")).toBeInTheDocument();
    expect(screen.getByText("corr-1")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("hides command:error rows when 'Show errors' is toggled off, leaving other entries", () => {
    render(<ProjectHistoryPage />);
    expect(screen.getByText("Save failed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.queryByText("Save failed.")).not.toBeInTheDocument();
    expect(screen.getByText(/frag-1/)).toBeInTheDocument();
  });
});
