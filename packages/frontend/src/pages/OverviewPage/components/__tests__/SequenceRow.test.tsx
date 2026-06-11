import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { SequenceRow } from "../SequenceRow";

const makeSequence = (overrides: Partial<Sequence> = {}): Sequence =>
  ({
    uuid: "seq-1",
    name: "Draft order",
    isMain: false,
    active: true,
    projectUuid: "p1",
    filePath: "seq-1.yaml",
    contentHash: "hash",
    sections: [],
    ...overrides,
  }) as Sequence;

const baseProps = {
  status: "ok" as const,
  count: 3,
  isActive: false,
  isEditing: false,
  isConfirmingDelete: false,
  editingDefaultName: "Draft order",
  showInsert: false,
  insertTargetName: undefined as string | undefined,
  clonePending: false,
  insertPending: false,
  onSelect: vi.fn(),
  onCommitRename: vi.fn(),
  onRenameDone: vi.fn(),
  onConfirmDelete: vi.fn(),
  onRequestDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  onClone: vi.fn(),
  onInsert: vi.fn(),
  onToggleActive: vi.fn(),
};

describe("SequenceRow", () => {
  it("renders the name + count and selects on click", () => {
    const onSelect = vi.fn();
    render(<SequenceRow {...baseProps} sequence={makeSequence()} onSelect={onSelect} />);
    expect(screen.getByText("Draft order")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Click the title text; the click bubbles to the enclosing select button.
    fireEvent.click(screen.getByText("Draft order"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the Main badge and hides activate/delete for the main sequence", () => {
    render(<SequenceRow {...baseProps} sequence={makeSequence({ isMain: true })} />);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /as a constraint/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete sequence/ })).not.toBeInTheDocument();
  });

  it("shows the insert affordance only when showInsert is set", () => {
    const { rerender } = render(<SequenceRow {...baseProps} sequence={makeSequence()} />);
    expect(screen.queryByRole("button", { name: /Insert sequence/ })).not.toBeInTheDocument();
    rerender(
      <SequenceRow {...baseProps} sequence={makeSequence()} showInsert insertTargetName="Main" />,
    );
    expect(screen.getByRole("button", { name: /Insert sequence/ })).toBeInTheDocument();
  });

  it("renders an inline rename input when editing", () => {
    render(<SequenceRow {...baseProps} sequence={makeSequence()} isEditing />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft order/ })).not.toBeInTheDocument();
  });

  it("renders confirm/cancel and routes their callbacks while confirming delete", () => {
    const onConfirmDelete = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <SequenceRow
        {...baseProps}
        sequence={makeSequence()}
        isConfirmingDelete
        onConfirmDelete={onConfirmDelete}
        onCancelDelete={onCancelDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });
});
