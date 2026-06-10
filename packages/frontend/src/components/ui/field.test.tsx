import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("wires the label to the control via a generated id", () => {
    render(<Field label="Project name">{(control) => <Input {...control} />}</Field>);
    // getByLabelText resolves only when <label htmlFor> matches the control id.
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("renders error text and wires aria-invalid + aria-describedby", () => {
    render(
      <Field label="Name" error="Required">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByText("Required");
    expect(input.getAttribute("aria-describedby") ?? "").toContain(error.id);
  });

  it("omits aria-invalid and error text when there is no error", () => {
    render(<Field label="Name">{(control) => <Input {...control} />}</Field>);
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("renders an optional description", () => {
    render(
      <Field label="Name" description="Shown to collaborators">
        {(control) => <Input {...control} />}
      </Field>,
    );
    expect(screen.getByText("Shown to collaborators")).toBeInTheDocument();
  });
});
