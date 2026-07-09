import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EMPTY_LINK_LOOKUPS } from "@lib/document-links/resolver";
import { LinkedText } from "./linked-text";
import type { SlotLinkApi } from "./slot-editor";

const linkApi = (navigate = vi.fn()): SlotLinkApi => ({
  lookups: {
    ...EMPTY_LINK_LOOKUPS,
    fragments: new Map([["chapter-1", "frag-uuid"]]),
    notes: new Map([["setting", "note-uuid"]]),
  },
  suggestionItems: [],
  navigate,
});

describe("LinkedText", () => {
  it("renders a resolved link as a clickable label that navigates on click", () => {
    const navigate = vi.fn();
    render(
      <LinkedText text="see [[fragments/chapter-1]] here" documentLinks={linkApi(navigate)} />,
    );
    const link = screen.getByRole("button", { name: "chapter-1" });
    expect(link).toHaveClass("doc-link");
    fireEvent.mouseDown(link);
    expect(navigate).toHaveBeenCalledWith("fragments", "frag-uuid");
    // Surrounding plain text is preserved.
    expect(screen.getByText(/see/)).toBeInTheDocument();
    expect(screen.getByText(/here/)).toBeInTheDocument();
  });

  it("renders an alias as the label but resolves the real target", () => {
    const navigate = vi.fn();
    render(<LinkedText text="[[notes/setting|The Manor]]" documentLinks={linkApi(navigate)} />);
    const link = screen.getByRole("button", { name: "The Manor" });
    fireEvent.mouseDown(link);
    expect(navigate).toHaveBeenCalledWith("notes", "note-uuid");
  });

  it("renders a broken link in the broken style with no navigation target", () => {
    const navigate = vi.fn();
    render(<LinkedText text="[[notes/missing]]" documentLinks={linkApi(navigate)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const broken = screen.getByText("missing");
    expect(broken).toHaveClass("doc-link-broken");
  });

  it("renders plain text verbatim when no link surface is wired", () => {
    render(<LinkedText text="a [[notes/setting]] link" />);
    expect(screen.getByText("a [[notes/setting]] link")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
