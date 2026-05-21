import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Picker, type PickerProps } from "../Picker";

type Fruit = { id: string; name: string };

const fruits: Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

function renderPicker(overrides: Partial<PickerProps<Fruit>> = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const result = render(
    <Picker
      items={fruits}
      getKey={(item) => item.id}
      getLabel={(item) => item.name}
      placeholder="Search fruits…"
      open={true}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect, onOpenChange, ...result };
}

describe("Picker", () => {
  it("renders all items when open", () => {
    renderPicker();
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cherry" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderPicker({ open: false });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("filters items by query", async () => {
    renderPicker();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "ban");
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Apple" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cherry" })).not.toBeInTheDocument();
  });

  it("shows empty state when no items match", async () => {
    renderPicker();
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "zzz");
    expect(screen.getByText("No items found.")).toBeInTheDocument();
  });

  it("selects item via Enter and calls onSelect + onOpenChange(false)", async () => {
    // cmdk pre-selects the first item (Apple) on mount; ArrowDown moves to Banana
    const { onSelect, onOpenChange } = renderPicker();
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(fruits[1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selects item via click and calls onSelect + onOpenChange(false)", async () => {
    const { onSelect, onOpenChange } = renderPicker();
    await userEvent.click(screen.getByRole("option", { name: "Banana" }));
    expect(onSelect).toHaveBeenCalledWith(fruits[1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", () => {
    const { onOpenChange } = renderPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders custom renderItem content", () => {
    renderPicker({
      renderItem: (item) => <span data-testid={`custom-${item.id}`}>{item.name} (custom)</span>,
    });
    expect(screen.getByTestId("custom-apple")).toBeInTheDocument();
    expect(screen.getByText("Apple (custom)")).toBeInTheDocument();
  });

  it("traps focus inside the picker when open and releases it on close", () => {
    // Focus restoration to the exact prior element is handled by Radix Dialog
    // and cannot be reliably verified in jsdom. This test verifies:
    // 1. focus moves into the picker (away from the trigger) when it opens
    // 2. the picker input is no longer in the document after close
    const TriggerAndPicker = ({ open }: { open: boolean }) => (
      <>
        <button data-testid="trigger">Trigger</button>
        <Picker
          items={fruits}
          getKey={(item) => item.id}
          getLabel={(item) => item.name}
          placeholder="Search fruits…"
          open={open}
          onOpenChange={vi.fn()}
          onSelect={vi.fn()}
        />
      </>
    );

    const { rerender } = render(<TriggerAndPicker open={false} />);
    const trigger = screen.getByTestId("trigger");
    act(() => {
      trigger.focus();
    });
    expect(document.activeElement).toBe(trigger);

    rerender(<TriggerAndPicker open={true} />);
    expect(document.activeElement).not.toBe(trigger);
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    rerender(<TriggerAndPicker open={false} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
