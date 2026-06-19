import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActiveFragmentLabel } from "../active-fragment-label";

describe("ActiveFragmentLabel", () => {
  it("renders the fragment key when present", () => {
    render(<ActiveFragmentLabel fragmentKey="the-river" />);
    expect(screen.getByText("the-river")).toBeInTheDocument();
  });

  it("renders nothing when no fragment is active", () => {
    const { container } = render(<ActiveFragmentLabel fragmentKey={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
