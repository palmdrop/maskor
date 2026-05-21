import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandsProvider, useCommandsContext } from "@lib/commands/CommandsProvider";
import { CommandPalette } from "@components/command-palette/CommandPalette";
import { useEditorInsertCommand } from "../useEditorInsertCommand";
import type { InsertCommandTarget } from "../useEditorInsertCommand";
import type { ReactNode } from "react";

const ITEM_A: InsertCommandTarget = { uuid: "uuid-a", key: "note-alpha" };
const ITEM_B: InsertCommandTarget = { uuid: "uuid-b", key: "note-beta" };

function TestHook({
  direction = "append",
  targetType = "note" as const,
  selectionText = "selected text",
  items = [ITEM_A, ITEM_B],
  onInsert = vi.fn(),
}: {
  direction?: "append" | "prepend";
  targetType?: "fragment" | "note" | "reference" | "aspect";
  selectionText?: string;
  items?: InsertCommandTarget[];
  onInsert?: (selectionText: string, target: InsertCommandTarget) => void;
}) {
  useEditorInsertCommand({
    direction,
    targetType,
    getSelection: () => ({ text: selectionText, isEmpty: selectionText.length === 0 }),
    getItems: () => items,
    onInsert,
  });
  return null;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true, bubbles: true });
}

const MapReader = ({
  onRead,
}: {
  onRead: (
    map: ReadonlyMap<
      string,
      ReturnType<typeof useCommandsContext>["getMap"] extends () => ReadonlyMap<string, infer V>
        ? V
        : never
    >,
  ) => void;
}) => {
  const { getMap } = useCommandsContext();
  onRead(getMap());
  return null;
};

describe("useEditorInsertCommand", () => {
  it("registers command with correct id and label for append+note", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "hi", isEmpty: false }),
        getItems: () => [ITEM_A],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    expect(command).toBeDefined();
    expect(command!.label).toBe("Append to note");
  });

  it("registers command with correct id and label for prepend+fragment", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "prepend",
        targetType: "fragment",
        getSelection: () => ({ text: "hi", isEmpty: false }),
        getItems: () => [ITEM_A],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.prepend-to-fragment");
    expect(command).toBeDefined();
    expect(command!.label).toBe("Prepend to fragment");
  });

  it("disabledReason is 'Select text first' when selection is empty", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "", isEmpty: true }),
        getItems: () => [ITEM_A],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    expect(command!.disabledReason).toBe("Select text first");
  });

  it("disabledReason reports 'No notes to append to' when item list is empty", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "hi", isEmpty: false }),
        getItems: () => [],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    expect(command!.disabledReason).toBe("No notes to append to");
  });

  it("disabledReason reports 'No aspects to prepend to' when item list is empty", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "prepend",
        targetType: "aspect",
        getSelection: () => ({ text: "hi", isEmpty: false }),
        getItems: () => [],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.prepend-to-aspect");
    expect(command!.disabledReason).toBe("No aspects to prepend to");
  });

  it("disabledReason is undefined when selection is non-empty and items exist", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "text", isEmpty: false }),
        getItems: () => [ITEM_A],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    expect(command!.disabledReason).toBeUndefined();
  });

  it("arg.items returns the current item list", () => {
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "hi", isEmpty: false }),
        getItems: () => [ITEM_A, ITEM_B],
        onInsert: vi.fn(),
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    const items = command!.arg!.items as InsertCommandTarget[];
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.key)).toEqual(["note-alpha", "note-beta"]);
  });

  it("command shows in palette with ellipsis appended (arg commands)", () => {
    render(
      <CommandsProvider>
        <TestHook direction="append" targetType="note" items={[ITEM_A]} />
        <CommandPalette />
      </CommandsProvider>,
    );
    openPalette();
    expect(screen.getByText("Append to note…")).toBeInTheDocument();
  });

  it("calls onInsert with selectionText and target when item is picked", async () => {
    const onInsert = vi.fn();
    render(
      <CommandsProvider>
        <TestHook
          direction="append"
          targetType="note"
          selectionText="some selection"
          items={[ITEM_A]}
          onInsert={onInsert}
        />
        <CommandPalette />
      </CommandsProvider>,
    );
    openPalette();
    await userEvent.click(screen.getByRole("option", { name: /Append to note…/ }));
    const noteOption = await screen.findByRole("option", { name: "note-alpha" });
    await userEvent.click(noteOption);
    expect(onInsert).toHaveBeenCalledWith("some selection", ITEM_A);
  });

  it("does not call onInsert when selection is empty (run guard)", () => {
    const onInsert = vi.fn();
    const onRead = vi.fn();
    const Component = () => {
      useEditorInsertCommand({
        direction: "append",
        targetType: "note",
        getSelection: () => ({ text: "", isEmpty: true }),
        getItems: () => [ITEM_A],
        onInsert,
      });
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });
    const lastMap = onRead.mock.calls.at(-1)![0];
    const command = lastMap.get("editor.append-to-note");
    command!.run(ITEM_A);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
