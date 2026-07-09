import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarginNotesTab } from "./margin-notes-tab";

// SlotEditor wraps TipTap/CM6 (not meaningful in happy-dom); stub it as a textarea that surfaces
// value + onChange so the notes tab's activate/edit wiring is testable.
vi.mock("./slot-editor", () => ({
  MARGIN_LINE_HEIGHT: 1.6,
  SlotEditor: ({
    value,
    onChange,
    onBlur,
  }: {
    value: string;
    onChange: (next: string) => void;
    onBlur?: () => void;
  }) => (
    <textarea
      data-testid="slot-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onBlur?.()}
    />
  ),
}));

describe("MarginNotesTab", () => {
  it("shows the notes text and its placeholder when there are no notes yet", () => {
    render(<MarginNotesTab notes="" mode="rich" fontSize={15} onChange={vi.fn()} />);
    expect(screen.getByText(/Thoughts on structure/)).toBeTruthy();
    // Idle: no active editor mounted.
    expect(screen.queryByTestId("slot-editor")).toBeNull();
  });

  it("renders the existing notes body idle", () => {
    render(
      <MarginNotesTab notes="a structural thought" mode="rich" fontSize={15} onChange={vi.fn()} />,
    );
    expect(screen.getByText("a structural thought")).toBeTruthy();
  });

  it("activates the editor on click and edits route through onChange (coupled save via marginEditor)", () => {
    const onChange = vi.fn();
    render(<MarginNotesTab notes="" mode="rich" fontSize={15} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const editor = screen.getByTestId("slot-editor");
    fireEvent.change(editor, { target: { value: "new note" } });
    expect(onChange).toHaveBeenCalledWith("new note");
  });

  it("deactivates the editor on blur", () => {
    render(<MarginNotesTab notes="existing" mode="rich" fontSize={15} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("slot-editor")).toBeTruthy();
    fireEvent.blur(screen.getByTestId("slot-editor"));
    // Back to the static body button.
    expect(screen.queryByTestId("slot-editor")).toBeNull();
    expect(screen.getByText("existing")).toBeTruthy();
  });
});
