import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PreviewNavSection } from "@api/generated/maskorAPI.schemas";
import { FragmentNavSidebar } from "./FragmentNavSidebar";

const sections: PreviewNavSection[] = [
  {
    uuid: "section-1",
    name: "Chapter One",
    fragments: [
      { uuid: "frag-1", key: "opening" },
      { uuid: "frag-2", key: "crossing" },
    ],
  },
];

describe("FragmentNavSidebar", () => {
  it("renders the header, section name, and fragment keys by default", () => {
    render(
      <FragmentNavSidebar sections={sections} header={<div>2 fragments</div>} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("2 fragments")).toBeInTheDocument();
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText("opening")).toBeInTheDocument();
    expect(screen.getByText("crossing")).toBeInTheDocument();
  });

  it("uses getFragmentLabel when provided", () => {
    render(
      <FragmentNavSidebar
        sections={sections}
        header={null}
        getFragmentLabel={(fragment) => `${fragment.uuid}. ${fragment.key}`}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("frag-1. opening")).toBeInTheDocument();
  });

  it("calls onSelect with the fragment uuid (the anchor id)", () => {
    const onSelect = vi.fn();
    render(<FragmentNavSidebar sections={sections} header={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("crossing"));
    expect(onSelect).toHaveBeenCalledWith("frag-2");
  });

  it("marks the active fragment with aria-current", () => {
    render(
      <FragmentNavSidebar
        sections={sections}
        header={null}
        activeAnchorId="frag-2"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("crossing")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("opening")).not.toHaveAttribute("aria-current");
  });
});
