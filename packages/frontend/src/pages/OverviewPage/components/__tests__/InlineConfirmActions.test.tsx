import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineConfirmActions } from "../InlineConfirmActions";

describe("InlineConfirmActions", () => {
  it("renders the confirm/cancel labels and routes their callbacks", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <InlineConfirmActions confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("supports a custom cancel label", () => {
    render(
      <InlineConfirmActions
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });
});
