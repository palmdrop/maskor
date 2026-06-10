import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldError } from "./field-error";

describe("FieldError", () => {
  it("renders the message with destructive styling", () => {
    render(<FieldError>Something went wrong</FieldError>);
    const error = screen.getByText("Something went wrong");
    expect(error).toHaveClass("text-destructive");
  });

  it("renders nothing when there is no message", () => {
    const { container } = render(<FieldError>{null}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty string", () => {
    const { container } = render(<FieldError>{""}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });
});
