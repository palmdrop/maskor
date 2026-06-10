import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox, CheckboxField } from "./checkbox";

describe("Checkbox", () => {
  it("reflects the checked state", () => {
    render(<Checkbox checked aria-label="toggle" />);
    expect(screen.getByRole("checkbox", { name: "toggle" })).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  it("fires onCheckedChange when clicked", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="toggle" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "toggle" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe("CheckboxField", () => {
  it("wires the label to the checkbox so clicking the label toggles it", () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckboxField label="Accept terms" checked={false} onCheckedChange={onCheckedChange} />,
    );
    fireEvent.click(screen.getByText("Accept terms"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
