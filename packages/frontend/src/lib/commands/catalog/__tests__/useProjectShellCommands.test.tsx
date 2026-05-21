import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { CommandPalette } from "@components/command-palette/CommandPalette";
import { useProjectShellCommands } from "../useProjectShellCommands";
import { ListSequences } from "@api/generated/sequences/sequences";

const PROJECT_ID = "proj-abc";

// vi.hoisted ensures this runs before the vi.mock factory so the variable is
// initialized by the time the factory captures it.
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@api/generated/sequences/sequences", () => ({
  ListSequences: vi.fn(),
}));

const mockListSequences = vi.mocked(ListSequences);

function TestHook() {
  useProjectShellCommands(PROJECT_ID);
  return null;
}

function renderWithShellCommands() {
  return render(
    <CommandsProvider>
      <TestHook />
      <CommandPalette />
    </CommandsProvider>,
  );
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true, bubbles: true });
}

describe("useProjectShellCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers Go to Fragment list command under Navigation section", () => {
    renderWithShellCommands();
    openPalette();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Go to Fragment list" })).toBeInTheDocument();
  });

  it("registers all 7 navigation commands", () => {
    renderWithShellCommands();
    openPalette();
    const expectedLabels = [
      "Go to Fragment list",
      "Go to Overview",
      "Go to Preview",
      "Go to Drafts",
      "Go to Stats",
      "Go to History",
      "Go to Project config",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("navigates to fragments when Go to Fragment list is selected", async () => {
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Go to Fragment list" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/fragments",
      params: { projectId: PROJECT_ID },
    });
  });

  it("navigates to overview when Go to Overview is selected", async () => {
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Go to Overview" }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/projects/$projectId/overview",
        params: { projectId: PROJECT_ID },
      }),
    );
  });

  it("registers Create section with create commands", () => {
    renderWithShellCommands();
    openPalette();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create fragment…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create note…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create reference…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create aspect…" })).toBeInTheDocument();
  });

  it("navigates to fragments when Create fragment… is selected", async () => {
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Create fragment…" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/fragments",
      params: { projectId: PROJECT_ID },
    });
  });

  it("navigates to config/notes tab when Create note… is selected", async () => {
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Create note…" }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId/config",
      params: { projectId: PROJECT_ID },
      search: { tab: "notes" },
    });
  });

  it("registers Switch sequence command; CommandRow appends ellipsis for arg commands", () => {
    renderWithShellCommands();
    openPalette();
    // Label is "Switch sequence", CommandRow auto-appends "…" because the command has arg.
    expect(screen.getByText("Switch sequence…")).toBeInTheDocument();
  });

  it("Switch sequence arg.items calls ListSequences with projectId", async () => {
    const sequences = [
      {
        uuid: "s-1",
        name: "Main",
        isMain: true,
        projectUuid: PROJECT_ID,
        filePath: "",
        contentHash: "",
        sections: [],
      },
    ];
    mockListSequences.mockResolvedValue({
      status: 200,
      data: { sequences, violations: [], cycles: [] },
    });
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Switch sequence…/ }));
    expect(mockListSequences).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("navigates to overview with sequence uuid when sequence is selected from picker", async () => {
    const sequences = [
      {
        uuid: "s-1",
        name: "Main",
        isMain: true,
        projectUuid: PROJECT_ID,
        filePath: "",
        contentHash: "",
        sections: [],
      },
    ];
    mockListSequences.mockResolvedValue({
      status: 200,
      data: { sequences, violations: [], cycles: [] },
    });
    renderWithShellCommands();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Switch sequence…/ }));
    const item = await screen.findByRole("option", { name: "Main" });
    await userEvent.click(item);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/projects/$projectId/overview",
        params: { projectId: PROJECT_ID },
        search: expect.objectContaining({ sequence: "s-1" }),
      }),
    );
  });
});
