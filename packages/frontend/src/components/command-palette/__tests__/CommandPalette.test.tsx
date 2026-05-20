import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { useCommand } from "@lib/commands/useCommand";
import { CommandPalette } from "../CommandPalette";
import type { ReactNode } from "react";

// Helper: render palette with a set of commands pre-registered
function renderWithCommands(
  commandDefs: Parameters<typeof useCommand>[0][],
  children?: ReactNode,
) {
  const Registrar = () => {
    for (const def of commandDefs) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useCommand(def);
    }
    return <>{children}</>;
  };

  return render(
    <CommandsProvider>
      <Registrar />
      <CommandPalette />
    </CommandsProvider>,
  );
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true, bubbles: true });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens on Cmd+K from body focus", () => {
    renderWithCommands([]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    openPalette();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens on Ctrl+K", () => {
    renderWithCommands([]);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens on Cmd+Shift+P", () => {
    renderWithCommands([]);
    fireEvent.keyDown(window, { key: "p", metaKey: true, shiftKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens when Cmd+K is fired from inside a focused element", () => {
    renderWithCommands(
      [],
      <div data-testid="editor-container" contentEditable suppressContentEditableWarning>
        editor
      </div>,
    );
    const editor = screen.getByTestId("editor-container");
    act(() => { editor.focus(); });
    fireEvent.keyDown(editor, { key: "k", metaKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderWithCommands([]);
    openPalette();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders view-scoped sections grouped by scope", () => {
    const onRun = vi.fn();
    renderWithCommands([
      { id: "a:one", label: "Alpha One", scope: "Alpha", category: "other", run: onRun },
      { id: "b:one", label: "Beta One", scope: "Beta", category: "other", run: onRun },
      { id: "a:two", label: "Alpha Two", scope: "Alpha", category: "other", run: onRun },
    ]);
    openPalette();
    const headings = screen.getAllByText(/Alpha|Beta/);
    const alphaHeading = headings.find((el) => el.textContent === "Alpha");
    const betaHeading = headings.find((el) => el.textContent === "Beta");
    expect(alphaHeading).toBeInTheDocument();
    expect(betaHeading).toBeInTheDocument();
    // Alpha appears before Beta (alphabetical scope order)
    expect(
      alphaHeading!.compareDocumentPosition(betaHeading!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders view-scoped sections before global category sections", () => {
    const onRun = vi.fn();
    renderWithCommands([
      { id: "view:cmd", label: "View Command", scope: "MyView", category: "other", run: onRun },
      { id: "global:cmd", label: "Global Command", scope: "global", category: "navigation", run: onRun },
    ]);
    openPalette();
    const viewHeading = screen.getByText("MyView");
    const globalHeading = screen.getByText("Navigation");
    expect(
      viewHeading.compareDocumentPosition(globalHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders hotkey badge with glyph for mod+k", () => {
    renderWithCommands([
      { id: "cmd:a", label: "Foo", scope: "Test", category: "other", hotkey: "mod+k", run: vi.fn() },
    ]);
    openPalette();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("renders hotkey badge with shift glyph for mod+shift+p", () => {
    renderWithCommands([
      { id: "cmd:b", label: "Bar", scope: "Test", category: "other", hotkey: "mod+shift+p", run: vi.fn() },
    ]);
    openPalette();
    expect(screen.getByText("⇧")).toBeInTheDocument();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("shows 'No commands found' when search matches nothing", async () => {
    renderWithCommands([
      { id: "cmd:c", label: "Apple", scope: "Test", category: "other", run: vi.fn() },
    ]);
    openPalette();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "zzzzz");
    expect(screen.getByText("No commands found.")).toBeInTheDocument();
  });

  it("shows disabled reason and does not invoke run when disabled command is selected", async () => {
    const onRun = vi.fn();
    renderWithCommands([
      {
        id: "cmd:disabled",
        label: "Locked Action",
        scope: "Test",
        category: "other",
        disabledReason: "Not ready",
        run: onRun,
      },
    ]);
    openPalette();
    expect(screen.getByText("Not ready")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Locked Action/ }));
    expect(onRun).not.toHaveBeenCalled();
  });

  it("invokes run and closes palette when an enabled command is selected", async () => {
    const onRun = vi.fn();
    renderWithCommands([
      { id: "cmd:enabled", label: "Run This", scope: "Test", category: "other", run: onRun },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Run This" }));
    expect(onRun).toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
