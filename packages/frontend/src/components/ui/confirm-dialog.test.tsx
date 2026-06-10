import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./confirm-dialog";

const baseProps = {
  open: true,
  onOpenChange: () => {},
  title: "Delete draft",
  confirmLabel: "Delete",
  onConfirm: () => {},
};

describe("ConfirmDialog", () => {
  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes via onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("swaps to pendingLabel and disables both buttons while pending", () => {
    render(<ConfirmDialog {...baseProps} pendingLabel="Deleting…" isPending />);
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("disables the confirm button when disabled is set", () => {
    render(<ConfirmDialog {...baseProps} disabled />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("renders body, error, and the destructive variant", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        variant="destructive"
        body={<p>This cannot be undone.</p>}
        error="Server error"
      />,
    );
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByText("Server error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });
});
