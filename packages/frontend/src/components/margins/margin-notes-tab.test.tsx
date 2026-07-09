import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EMPTY_LINK_LOOKUPS } from "@lib/document-links/resolver";
import { MarginNotesTab } from "./margin-notes-tab";
import type { SlotLinkApi } from "./slot-editor";

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

  it("renders a resolved [[link]] in the static notes body and navigates on click", () => {
    const navigate = vi.fn();
    const documentLinks: SlotLinkApi = {
      lookups: { ...EMPTY_LINK_LOOKUPS, notes: new Map([["setting", "note-uuid"]]) },
      suggestionItems: [],
      navigate,
    };
    render(
      <MarginNotesTab
        notes="revisit [[notes/setting]]"
        mode="rich"
        fontSize={15}
        documentLinks={documentLinks}
        onChange={vi.fn()}
      />,
    );
    const link = screen.getByRole("button", { name: "setting" });
    fireEvent.mouseDown(link);
    expect(navigate).toHaveBeenCalledWith("notes", "note-uuid");
  });

  it("renders a broken [[link]] in the broken style", () => {
    const documentLinks: SlotLinkApi = {
      lookups: EMPTY_LINK_LOOKUPS,
      suggestionItems: [],
      navigate: vi.fn(),
    };
    render(
      <MarginNotesTab
        notes="[[notes/missing]]"
        mode="rich"
        fontSize={15}
        documentLinks={documentLinks}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("missing")).toHaveClass("doc-link-broken");
  });
});
