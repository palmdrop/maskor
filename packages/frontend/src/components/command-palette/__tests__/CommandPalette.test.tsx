import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { useCommand } from "@lib/commands/useCommand";
import { CommandPalette } from "../CommandPalette";
import type { ReactNode } from "react";

type CommandInput = Parameters<typeof useCommand>[0];

const RegistrarItem = ({ def }: { def: CommandInput }) => {
  useCommand(def);
  return null;
};

// Helper: render palette with a set of commands pre-registered
function renderWithCommands(commandDefs: CommandInput[], children?: ReactNode) {
  return render(
    <CommandsProvider>
      {commandDefs.map((def) => (
        <RegistrarItem key={def.id} def={def} />
      ))}
      {children}
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
    act(() => {
      editor.focus();
    });
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
      {
        id: "global:cmd",
        label: "Global Command",
        scope: "global",
        category: "navigation",
        run: onRun,
      },
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
      {
        id: "cmd:a",
        label: "Foo",
        scope: "Test",
        category: "other",
        hotkey: "mod+k",
        run: vi.fn(),
      },
    ]);
    openPalette();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("renders hotkey badge with shift glyph for mod+shift+p", () => {
    renderWithCommands([
      {
        id: "cmd:b",
        label: "Bar",
        scope: "Test",
        category: "other",
        hotkey: "mod+shift+p",
        run: vi.fn(),
      },
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

  // --- Phase 5: parameterized commands ---

  it("renders ellipsis on commands with arg", () => {
    renderWithCommands([
      {
        id: "cmd:arg",
        label: "Pick Something",
        scope: "Test",
        category: "other",
        arg: {
          items: [{ id: "1", name: "Item" }],
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    expect(screen.getByText("Pick Something…")).toBeInTheDocument();
  });

  it("transitions to arg picker when selecting a command with static arg items", async () => {
    const items = [
      { id: "1", name: "Item One" },
      { id: "2", name: "Item Two" },
    ];
    renderWithCommands([
      {
        id: "cmd:arg",
        label: "Pick Something",
        scope: "Test",
        category: "other",
        arg: {
          items,
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
          placeholder: "Choose an item",
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    expect(screen.getByPlaceholderText("Choose an item")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item One" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item Two" })).toBeInTheDocument();
  });

  it("invokes run with selected arg item and closes palette", async () => {
    const onRun = vi.fn();
    const items = [{ id: "1", name: "Item One" }];
    renderWithCommands([
      {
        id: "cmd:arg",
        label: "Pick Something",
        scope: "Test",
        category: "other",
        arg: {
          items,
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
        },
        run: onRun,
      },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    await userEvent.click(screen.getByRole("option", { name: "Item One" }));
    expect(onRun).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("Esc from arg picker returns to command list with prior query restored", async () => {
    const items = [{ id: "1", name: "Item One" }];
    renderWithCommands([
      {
        id: "cmd:arg",
        label: "Pick Something",
        scope: "Test",
        category: "other",
        arg: {
          items,
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "pick");
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    // Now in arg picker mode
    expect(screen.queryByPlaceholderText("Search commands…")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // Back to command list with prior query
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox")).toHaveValue("pick");
  });

  it("shows loading skeletons while async arg items resolve", async () => {
    let resolveItems!: (items: { id: string; name: string }[]) => void;
    const loadItems = vi.fn(
      () =>
        new Promise<{ id: string; name: string }[]>((resolve) => {
          resolveItems = resolve;
        }),
    );
    renderWithCommands([
      {
        id: "cmd:async-arg",
        label: "Async Pick",
        scope: "Test",
        category: "other",
        arg: {
          items: loadItems,
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Async Pick/ }));
    // Skeletons visible while loading
    await waitFor(() => {
      expect(screen.getAllByTestId("arg-skeleton").length).toBeGreaterThan(0);
    });
    // Resolve the items
    await act(async () => {
      resolveItems([{ id: "1", name: "Resolved Item" }]);
    });
    expect(screen.queryByTestId("arg-skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Resolved Item" })).toBeInTheDocument();
  });

  it("renders zero-item static arg command as disabled with explanation", () => {
    renderWithCommands([
      {
        id: "cmd:empty-arg",
        label: "Empty Picker",
        scope: "Test",
        category: "other",
        arg: {
          items: [],
          getKey: (item: unknown) => String(item),
          getLabel: (item: unknown) => String(item),
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    expect(screen.getByText("No items available")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Empty Picker/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("discards stale arg-items resolution when user returns to the command list before load completes", async () => {
    let resolveItems!: (items: { id: string; name: string }[]) => void;
    const loadItems = vi.fn(
      () =>
        new Promise<{ id: string; name: string }[]>((resolve) => {
          resolveItems = resolve;
        }),
    );
    renderWithCommands([
      {
        id: "cmd:async-arg",
        label: "Async Pick",
        scope: "Test",
        category: "other",
        arg: {
          items: loadItems,
          getKey: (item: { id: string }) => item.id,
          getLabel: (item: { id: string; name: string }) => item.name,
        },
        run: vi.fn(),
      },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Async Pick/ }));
    await waitFor(() => {
      expect(screen.getAllByTestId("arg-skeleton").length).toBeGreaterThan(0);
    });

    // Esc back to the command list while the load is still in flight.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    });

    // Late resolution must not leak items into the now-current command list.
    await act(async () => {
      resolveItems([{ id: "1", name: "Stale Item" }]);
    });
    expect(screen.queryByRole("option", { name: "Stale Item" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
  });

  it("does not transition to arg picker when zero-item command is selected", async () => {
    const onRun = vi.fn();
    renderWithCommands([
      {
        id: "cmd:empty-arg",
        label: "Empty Picker",
        scope: "Test",
        category: "other",
        arg: {
          items: [],
          getKey: (item: unknown) => String(item),
          getLabel: (item: unknown) => String(item),
        },
        run: onRun,
      },
    ]);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Empty Picker/ }));
    // Still on command list, not arg picker
    expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
  });
});
