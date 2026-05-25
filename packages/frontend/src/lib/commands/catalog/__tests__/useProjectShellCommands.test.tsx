import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { CommandPalette } from "@components/command-palette/CommandPalette";
import { useProjectShellCommands } from "../useProjectShellCommands";

// Navigation and switch-sequence migrated to commands/global/* in Phase 2;
// this catalog hook now only registers the four create:* commands. They stay
// here until Phase 4 because they close over ProjectShellLayout's dialog state.

const handlers = {
  onCreateFragment: vi.fn(),
  onCreateNote: vi.fn(),
  onCreateReference: vi.fn(),
  onCreateAspect: vi.fn(),
};

function Host() {
  useProjectShellCommands(handlers);
  return null;
}

function renderWithHost() {
  return render(
    <CommandsProvider>
      <Host />
      <CommandPalette />
    </CommandsProvider>,
  );
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true, bubbles: true });
}

describe("useProjectShellCommands (create:*)", () => {
  beforeEach(() => {
    handlers.onCreateFragment.mockReset();
    handlers.onCreateNote.mockReset();
    handlers.onCreateReference.mockReset();
    handlers.onCreateAspect.mockReset();
  });

  it("registers all four Create commands in the palette", () => {
    renderWithHost();
    openPalette();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create fragment…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create note…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create reference…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Create aspect…" })).toBeInTheDocument();
  });

  it.each([
    ["Create fragment…", "onCreateFragment"],
    ["Create note…", "onCreateNote"],
    ["Create reference…", "onCreateReference"],
    ["Create aspect…", "onCreateAspect"],
  ] as const)("invokes %s handler when selected", async (label, handlerKey) => {
    renderWithHost();
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: label }));
    expect(handlers[handlerKey]).toHaveBeenCalledOnce();
  });
});
