import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CommandEmpty, CommandItem } from "cmdk";
import { Picker } from "../Picker";

const noop = () => {};

function renderPicker(overrides: Partial<Omit<Parameters<typeof Picker>[0], "children">> = {}) {
  const onOpenChange = vi.fn();
  const result = render(
    <Picker
      open={true}
      onOpenChange={onOpenChange}
      placeholder="Search…"
      query=""
      onQueryChange={noop}
      title="Test Picker"
      {...overrides}
    >
      <CommandItem value="item-1">Item One</CommandItem>
      <CommandItem value="item-2">Item Two</CommandItem>
    </Picker>,
  );
  return { onOpenChange, ...result };
}

describe("Picker", () => {
  it("renders the input and children when open", () => {
    renderPicker();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item One" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item Two" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderPicker({ open: false });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders the placeholder text in the input", () => {
    renderPicker({ placeholder: "Jump to entity…" });
    expect(screen.getByPlaceholderText("Jump to entity…")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) on Escape", () => {
    const { onOpenChange } = renderPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onEscapeKeyDown when provided; preventing default keeps the dialog open", () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn((event: Event) => event.preventDefault());
    render(
      <Picker
        open={true}
        onOpenChange={onOpenChange}
        placeholder="Search…"
        query=""
        onQueryChange={noop}
        title="Test"
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <CommandItem value="x">X</CommandItem>
      </Picker>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscapeKeyDown).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("renders children including CommandEmpty", () => {
    render(
      <Picker
        open={true}
        onOpenChange={noop}
        placeholder="Search…"
        query="zzz"
        onQueryChange={noop}
        title="Test"
      >
        <CommandEmpty>Nothing here.</CommandEmpty>
        <CommandItem value="item-1">Item One</CommandItem>
      </Picker>,
    );
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("traps focus inside the picker when open and releases it on close", () => {
    const TriggerAndPicker = ({ open }: { open: boolean }) => (
      <>
        <button data-testid="trigger">Trigger</button>
        <Picker
          open={open}
          onOpenChange={vi.fn()}
          placeholder="Search…"
          query=""
          onQueryChange={noop}
          title="Test"
        >
          <CommandItem value="x">X</CommandItem>
        </Picker>
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
