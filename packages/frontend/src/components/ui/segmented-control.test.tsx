import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl, type SegmentedControlOption } from "./segmented-control";

type Mode = "keep" | "cut" | "link";

const options: readonly SegmentedControlOption<Mode>[] = [
  { value: "keep", label: "Keep" },
  { value: "cut", label: "Cut" },
  { value: "link", label: "Link", disabled: true, title: "Link mode is not yet available" },
];

describe("SegmentedControl", () => {
  it("marks the selected option as pressed", () => {
    render(<SegmentedControl options={options} value="keep" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Keep" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cut" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="keep" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cut" }));
    expect(onChange).toHaveBeenCalledWith("cut");
  });

  it("does not fire onChange for a per-option disabled choice", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="keep" onChange={onChange} />);
    const link = screen.getByRole("button", { name: "Link" });
    expect(link).toBeDisabled();
    fireEvent.click(link);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables every option when the whole control is disabled", () => {
    render(<SegmentedControl options={options} value="keep" onChange={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cut" })).toBeDisabled();
  });
});
