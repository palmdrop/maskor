import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { defineScope, defineGlobalCommand, defineScopeCommand } from "@lib/commands/define";
import { commandPaletteCommands } from "@lib/commands/scopes/command-palette";

// ---------------------------------------------------------------------
// Fixture catalog
// ---------------------------------------------------------------------
//
// Each test publishes one or more of these scopes (via useCommandScope) and
// inspects how the palette renders them. The scopes' contexts carry an `onRun`
// callback so tests can assert which command was invoked.

interface RunCtx {
  onRun: (id: string, arg?: unknown) => void;
}

type Item = { id: string; name: string };

interface ArgCtx extends RunCtx {
  staticItems?: readonly Item[];
  asyncItems?: () => Promise<readonly Item[]>;
  isEmpty?: boolean;
}

// Outer / Inner used for innermost-first ordering tests.
const outerScope = defineScope<RunCtx>("test-outer", { label: "Outer" });
const innerScope = defineScope<RunCtx>("test-inner", { label: "Inner" });

const outerCmd = defineScopeCommand(outerScope, {
  id: "outer:cmd",
  label: "Outer Command",
  category: "other",
  run: (ctx) => ctx.onRun("outer:cmd"),
});
const innerCmd = defineScopeCommand(innerScope, {
  id: "inner:cmd",
  label: "Inner Command",
  category: "other",
  run: (ctx) => ctx.onRun("inner:cmd"),
});

// MyView used for the view-before-globals test.
const myViewScope = defineScope<RunCtx>("test-myview", { label: "MyView" });
const myViewCmd = defineScopeCommand(myViewScope, {
  id: "view:cmd",
  label: "View Command",
  category: "other",
  run: (ctx) => ctx.onRun("view:cmd"),
});

// Globals — registered unconditionally; visible in every test.
const globalNav = defineGlobalCommand({
  id: "test-global:nav",
  label: "Global Nav",
  category: "navigation",
  run: () => {},
});

// "Test" — kitchen-sink scope for hotkeys, disabled, arg flows.
const testScope = defineScope<ArgCtx>("test-kit", { label: "Test" });

const enabledCmd = defineScopeCommand(testScope, {
  id: "cmd:enabled",
  label: "Run This",
  category: "other",
  run: (ctx) => ctx.onRun("cmd:enabled"),
});

const appleCmd = defineScopeCommand(testScope, {
  id: "cmd:apple",
  label: "Apple",
  category: "other",
  run: (ctx) => ctx.onRun("cmd:apple"),
});

const hotkeyShiftPCmd = defineScopeCommand(testScope, {
  id: "cmd:hotkey-shift-p",
  label: "Bar",
  category: "other",
  hotkey: "mod+shift+p",
  run: () => {},
});

const lockedCmd = defineScopeCommand(testScope, {
  id: "cmd:locked",
  label: "Locked Action",
  category: "other",
  disabled: () => "Not ready",
  run: (ctx) => ctx.onRun("cmd:locked"),
});

const argCmd = defineScopeCommand(testScope, {
  id: "cmd:with-arg",
  label: "Pick Something",
  category: "other",
  arg: {
    items: (ctx): readonly Item[] => ctx.staticItems ?? [],
    getKey: (item) => item.id,
    getLabel: (item) => item.name,
    placeholder: "Choose an item",
  },
  run: (ctx, item) => ctx.onRun("cmd:with-arg", item),
});

const asyncArgCmd = defineScopeCommand(testScope, {
  id: "cmd:async-arg",
  label: "Async Pick",
  category: "other",
  arg: {
    items: async (ctx): Promise<readonly Item[]> => (ctx.asyncItems ? await ctx.asyncItems() : []),
    getKey: (item) => item.id,
    getLabel: (item) => item.name,
  },
  run: (ctx, item) => ctx.onRun("cmd:async-arg", item),
});

const emptyArgCmd = defineScopeCommand(testScope, {
  id: "cmd:empty-arg",
  label: "Empty Picker",
  category: "other",
  // Empty-arg auto-disable was dropped with the legacy CommandArg union; the
  // command now reports its empty state via `disabled` directly.
  disabled: () => "No items available",
  arg: {
    items: (): readonly Item[] => [],
    getKey: (item) => item.id,
    getLabel: (item) => item.name,
  },
  run: (ctx, item) => ctx.onRun("cmd:empty-arg", item),
});

vi.mock("@lib/commands/catalog", () => ({
  allCommands: [
    outerCmd,
    innerCmd,
    myViewCmd,
    globalNav,
    enabledCmd,
    appleCmd,
    hotkeyShiftPCmd,
    lockedCmd,
    argCmd,
    asyncArgCmd,
    emptyArgCmd,
    ...commandPaletteCommands,
  ] as const,
}));

// Imports below run after the vi.mock hoist.
const { CommandsProvider } = await import("@lib/commands/CommandsProvider");
const { useCommandScope } = await import("@lib/commands/useCommandScope");
const { HotkeyBinder } = await import("@lib/commands/HotkeyBinder");
const { CommandPalette } = await import("../CommandPalette");

const TestPublisher = ({ ctx }: { ctx: ArgCtx }) => {
  useCommandScope(testScope, ctx);
  return null;
};

const MyViewPublisher = ({ ctx }: { ctx: RunCtx }) => {
  useCommandScope(myViewScope, ctx);
  return null;
};

const OuterPublisher = ({ ctx, children }: { ctx: RunCtx; children?: ReactNode }) => {
  useCommandScope(outerScope, ctx);
  return <>{children}</>;
};

const InnerPublisher = ({ ctx }: { ctx: RunCtx }) => {
  useCommandScope(innerScope, ctx);
  return null;
};

const renderShell = (children?: ReactNode) =>
  render(
    <CommandsProvider>
      <HotkeyBinder />
      {children}
      <CommandPalette />
    </CommandsProvider>,
  );

const openPalette = () => fireEvent.keyDown(document, { key: "k", metaKey: true, bubbles: true });

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Open / close ---

  it("opens on Cmd+K from body focus", () => {
    renderShell();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    openPalette();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens on Ctrl+K", () => {
    renderShell();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens on Cmd+Shift+P", () => {
    renderShell();
    fireEvent.keyDown(document, { key: "p", metaKey: true, shiftKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens when Cmd+K is fired from inside a focused contentEditable", () => {
    renderShell(
      <div data-testid="editor-container" contentEditable suppressContentEditableWarning>
        editor
      </div>,
    );
    const editor = screen.getByTestId("editor-container");
    act(() => editor.focus());
    fireEvent.keyDown(editor, { key: "k", metaKey: true, bubbles: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderShell();
    openPalette();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  // --- Section ordering ---

  it("orders active scopes innermost-first, then global sections", () => {
    const ctx = { onRun: vi.fn() };
    renderShell(
      <OuterPublisher ctx={ctx}>
        <InnerPublisher ctx={ctx} />
      </OuterPublisher>,
    );
    openPalette();

    const innerHeading = screen.getByText("Inner");
    const outerHeading = screen.getByText("Outer");
    const globalHeading = screen.getByText("Navigation");

    // Inner before Outer
    expect(
      innerHeading.compareDocumentPosition(outerHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Outer before any global section
    expect(
      outerHeading.compareDocumentPosition(globalHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders view-scoped sections before global category sections", () => {
    const ctx = { onRun: vi.fn() };
    renderShell(<MyViewPublisher ctx={ctx} />);
    openPalette();
    const viewHeading = screen.getByText("MyView");
    const globalHeading = screen.getByText("Navigation");
    expect(
      viewHeading.compareDocumentPosition(globalHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("flattens sections and ranks by relevance once the user starts typing", async () => {
    // Active scopes: Outer + Inner. Inner is innermost so it would normally
    // render above Outer's "Outer Command" — yet typing "outer" must put
    // "Outer Command" first because section grouping collapses during search.
    const ctx = { onRun: vi.fn() };
    renderShell(
      <OuterPublisher ctx={ctx}>
        <InnerPublisher ctx={ctx} />
      </OuterPublisher>,
    );
    openPalette();

    // Section headings are visible while query is empty.
    expect(screen.getByText("Inner")).toBeInTheDocument();
    expect(screen.getByText("Outer")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("combobox"), "outer");

    // Headings disappear; remaining items are a flat list sorted by score.
    expect(screen.queryByText("Inner")).not.toBeInTheDocument();
    expect(screen.queryByText("Outer")).not.toBeInTheDocument();

    const outerOption = screen.getByRole("option", { name: /Outer Command/ });
    const innerOption = screen.queryByRole("option", { name: /Inner Command/ });
    // Inner Command shouldn't match "outer" with any score, so it's gone.
    expect(innerOption).not.toBeInTheDocument();
    expect(outerOption).toBeInTheDocument();
  });

  // --- Hotkey display ---

  it("renders hotkey badge with glyph for mod+k", () => {
    const ctx: ArgCtx = { onRun: vi.fn() };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    expect(screen.getAllByText("K").length).toBeGreaterThan(0);
  });

  it("renders hotkey badge with shift glyph for mod+shift+p", () => {
    const ctx: ArgCtx = { onRun: vi.fn() };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    expect(screen.getByText("⇧")).toBeInTheDocument();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  // --- Empty state / disabled / enabled ---

  it("shows 'No commands found' when search matches nothing", async () => {
    const ctx: ArgCtx = { onRun: vi.fn() };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    await userEvent.type(screen.getByRole("combobox"), "zzzzz");
    expect(screen.getByText("No commands found.")).toBeInTheDocument();
  });

  it("shows disabled reason and does not invoke run when disabled command is selected", async () => {
    const onRun = vi.fn();
    renderShell(<TestPublisher ctx={{ onRun }} />);
    openPalette();
    expect(screen.getByText("Not ready")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Locked Action/ }));
    expect(onRun).not.toHaveBeenCalledWith("cmd:locked");
  });

  it("invokes run and closes the palette when an enabled command is selected", async () => {
    const onRun = vi.fn();
    renderShell(<TestPublisher ctx={{ onRun }} />);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: "Run This" }));
    expect(onRun).toHaveBeenCalledWith("cmd:enabled");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  // --- Parameterized (arg) commands ---

  it("renders ellipsis on commands with arg", () => {
    const ctx: ArgCtx = { onRun: vi.fn(), staticItems: [{ id: "1", name: "Item" }] };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    expect(screen.getByText("Pick Something…")).toBeInTheDocument();
  });

  it("transitions to the arg picker when selecting a parameterized command", async () => {
    const ctx: ArgCtx = {
      onRun: vi.fn(),
      staticItems: [
        { id: "1", name: "Item One" },
        { id: "2", name: "Item Two" },
      ],
    };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    expect(screen.getByPlaceholderText("Choose an item")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item One" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item Two" })).toBeInTheDocument();
  });

  it("invokes run with the selected arg item and closes the palette", async () => {
    const onRun = vi.fn();
    const items = [{ id: "1", name: "Item One" }];
    renderShell(<TestPublisher ctx={{ onRun, staticItems: items }} />);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    await userEvent.click(screen.getByRole("option", { name: "Item One" }));
    expect(onRun).toHaveBeenCalledWith("cmd:with-arg", items[0]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("Esc from arg picker returns to the command list with prior query restored", async () => {
    const ctx: ArgCtx = { onRun: vi.fn(), staticItems: [{ id: "1", name: "Item One" }] };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "pick");
    await userEvent.click(screen.getByRole("option", { name: /Pick Something/ }));
    expect(screen.queryByPlaceholderText("Search commands…")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox")).toHaveValue("pick");
  });

  it("shows loading skeletons while async arg items resolve", async () => {
    let resolveItems!: (items: Item[]) => void;
    const asyncItems = vi.fn(
      () =>
        new Promise<Item[]>((resolve) => {
          resolveItems = resolve;
        }),
    );
    const ctx: ArgCtx = { onRun: vi.fn(), asyncItems };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Async Pick/ }));
    await waitFor(() => {
      expect(screen.getAllByTestId("arg-skeleton").length).toBeGreaterThan(0);
    });
    await act(async () => {
      resolveItems([{ id: "1", name: "Resolved Item" }]);
    });
    expect(screen.queryByTestId("arg-skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Resolved Item" })).toBeInTheDocument();
  });

  it("renders a zero-item arg command as disabled with explanation", () => {
    // Other arg commands need non-empty items so only the empty-arg row shows
    // the "No items available" label.
    const ctx: ArgCtx = {
      onRun: vi.fn(),
      staticItems: [{ id: "x", name: "X" }],
      asyncItems: async () => [{ id: "y", name: "Y" }],
    };
    renderShell(<TestPublisher ctx={ctx} />);
    openPalette();
    expect(screen.getByText("No items available")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Empty Picker/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("does not transition to the arg picker when a zero-item command is selected", async () => {
    const onRun = vi.fn();
    renderShell(
      <TestPublisher
        ctx={{
          onRun,
          staticItems: [{ id: "x", name: "X" }],
          asyncItems: async () => [{ id: "y", name: "Y" }],
        }}
      />,
    );
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Empty Picker/ }));
    expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalledWith("cmd:empty-arg");
  });

  it("discards stale async-arg resolutions when the user Esc's back before load completes", async () => {
    let resolveItems!: (items: Item[]) => void;
    const asyncItems = vi.fn(
      () =>
        new Promise<Item[]>((resolve) => {
          resolveItems = resolve;
        }),
    );
    renderShell(<TestPublisher ctx={{ onRun: vi.fn(), asyncItems }} />);
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Async Pick/ }));
    await waitFor(() => {
      expect(screen.getAllByTestId("arg-skeleton").length).toBeGreaterThan(0);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
    });
    await act(async () => {
      resolveItems([{ id: "1", name: "Stale Item" }]);
    });
    expect(screen.queryByRole("option", { name: "Stale Item" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search commands…")).toBeInTheDocument();
  });
});
