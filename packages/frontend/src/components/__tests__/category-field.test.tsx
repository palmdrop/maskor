import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryField } from "../category-field";

describe("CategoryField — rendering", () => {
  it("renders with the server value pre-filled", () => {
    render(<CategoryField serverValue="world/places" existingCategories={[]} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("world/places")).toBeInTheDocument();
  });

  it("renders empty when serverValue is null", () => {
    render(<CategoryField serverValue={null} existingCategories={[]} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/empty for root/)).toHaveValue("");
  });

  it("displays a server-side error", () => {
    render(
      <CategoryField
        serverValue={null}
        existingCategories={[]}
        onChange={vi.fn()}
        error="Save failed."
      />,
    );
    expect(screen.getByText("Save failed.")).toBeInTheDocument();
  });
});

describe("CategoryField — client-side validation", () => {
  it("calls onChange with the trimmed path for a valid category", async () => {
    const onChange = vi.fn();
    render(<CategoryField serverValue={null} existingCategories={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.type(input, "world/places");

    expect(onChange).toHaveBeenLastCalledWith("world/places");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onChange(null) when the input is cleared", async () => {
    const onChange = vi.fn();
    render(
      <CategoryField serverValue="world/places" existingCategories={[]} onChange={onChange} />,
    );

    const input = screen.getByDisplayValue("world/places");
    await userEvent.clear(input);

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows an inline error and does NOT call onChange for a value containing invalid chars", async () => {
    const onChange = vi.fn();
    render(<CategoryField serverValue={null} existingCategories={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/empty for root/);
    // "?" is invalid in a category segment — once typed the whole string fails
    await userEvent.type(input, "ok?bad");

    expect(
      screen.getByText(/letters, numbers, spaces, hyphens, and underscores/),
    ).toBeInTheDocument();
    // onChange is never called with the invalid string (only with valid prefixes before "?")
    const calledArgs = onChange.mock.calls.flat();
    expect(calledArgs).not.toContain("ok?bad");
    expect(calledArgs).not.toContain("ok?");
  });

  it("rejects a leading slash", async () => {
    const onChange = vi.fn();
    render(<CategoryField serverValue={null} existingCategories={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.type(input, "/leading-slash");

    expect(screen.getByText(/must not start or end with a slash/)).toBeInTheDocument();
  });

  it("rejects doubled slashes (empty segment)", async () => {
    const onChange = vi.fn();
    render(<CategoryField serverValue={null} existingCategories={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.type(input, "a//b");

    expect(screen.getByText(/empty segments/)).toBeInTheDocument();
  });

  it("syncs back from server when not focused", async () => {
    const { rerender } = render(
      <CategoryField serverValue="old" existingCategories={[]} onChange={vi.fn()} />,
    );
    rerender(<CategoryField serverValue="new-val" existingCategories={[]} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("new-val")).toBeInTheDocument();
  });
});

describe("CategoryField — autocomplete", () => {
  it("shows matching suggestions when the user types a prefix", async () => {
    render(
      <CategoryField
        serverValue={null}
        existingCategories={["world/places", "world/characters", "arcs"]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.type(input, "world");

    expect(screen.getByText("world/places")).toBeInTheDocument();
    expect(screen.getByText("world/characters")).toBeInTheDocument();
    expect(screen.queryByText("arcs")).not.toBeInTheDocument();
  });

  it("shows all categories when the input is empty and focused", async () => {
    render(
      <CategoryField
        serverValue={null}
        existingCategories={["books", "films", "arcs"]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.click(input);

    expect(screen.getByText("books")).toBeInTheDocument();
    expect(screen.getByText("films")).toBeInTheDocument();
    expect(screen.getByText("arcs")).toBeInTheDocument();
  });

  it("selecting a suggestion fills the input and calls onChange", async () => {
    const onChange = vi.fn();
    render(
      <CategoryField
        serverValue={null}
        existingCategories={["world/places"]}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText(/empty for root/);
    await userEvent.click(input);
    await userEvent.click(screen.getByText("world/places"));

    expect(onChange).toHaveBeenLastCalledWith("world/places");
    expect(screen.getByDisplayValue("world/places")).toBeInTheDocument();
  });
});
