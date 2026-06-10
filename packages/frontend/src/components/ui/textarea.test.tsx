import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea and forwards rows + value", () => {
    render(<Textarea rows={6} value="hello" onChange={() => {}} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "6");
    expect(textarea).toHaveValue("hello");
  });

  it("fires onChange when the user types", () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("merges custom className with the base classes", () => {
    render(<Textarea className="custom-class" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom-class", "resize-none");
  });
});
