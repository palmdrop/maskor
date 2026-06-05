import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { TagCombobox } from "./tag-combobox";

describe("TagCombobox — Enter key behavior", () => {
  it("Enter selects the highlighted option even when the create affordance is also visible", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();

    render(
      <TagCombobox availableOptions={["foo", "bar"]} onSelect={onSelect} onCreate={onCreate} />,
    );

    const input = screen.getByRole("textbox");

    // Type "f": filtered options show "foo"; create affordance also appears since "f" ≠ "foo"
    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "f" } });
    });

    // Wait for cmdk to render and auto-highlight the first item
    await waitFor(() => {
      const option = screen.queryByRole("option", { name: "foo" });
      expect(option).toBeInTheDocument();
      expect(option).toHaveAttribute("data-selected", "true");
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSelect).toHaveBeenCalledWith("foo");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Enter calls onCreate when no existing option matches the query", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();

    render(
      <TagCombobox availableOptions={["foo", "bar"]} onSelect={onSelect} onCreate={onCreate} />,
    );

    const input = screen.getByRole("textbox");

    // Type "xyz": no options match, only the create affordance is shown
    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "xyz" } });
    });

    // Wait for cmdk to render and auto-highlight the create item
    await waitFor(() => {
      expect(screen.queryByText(/Create/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onCreate).toHaveBeenCalledWith("xyz");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
