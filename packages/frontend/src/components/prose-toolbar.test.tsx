import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { ProseToolbar } from "./prose-toolbar";

// A minimal Editor stub: the toolbar only reads `isActive` and builds command chains, none of which
// the link button touches — so a no-op chain suffices.
const stubEditor = (): Editor => {
  const chain = {
    focus: () => chain,
    setParagraph: () => chain,
    toggleHeading: () => chain,
    toggleBold: () => chain,
    toggleItalic: () => chain,
    toggleStrike: () => chain,
    toggleBlockquote: () => chain,
    toggleBulletList: () => chain,
    toggleOrderedList: () => chain,
    setHorizontalRule: () => chain,
    run: () => true,
  };
  return {
    isActive: () => false,
    chain: () => chain,
  } as unknown as Editor;
};

describe("ProseToolbar link button", () => {
  it("renders the link button and dispatches onInsertLink when clicked", () => {
    const onInsertLink = vi.fn();
    render(<ProseToolbar editor={stubEditor()} onInsertLink={onInsertLink} />);

    const button = screen.getByRole("button", { name: "Insert link" });
    fireEvent.click(button);

    expect(onInsertLink).toHaveBeenCalledTimes(1);
  });

  it("hides the link button when no onInsertLink is provided", () => {
    render(<ProseToolbar editor={stubEditor()} />);
    expect(screen.queryByRole("button", { name: "Insert link" })).not.toBeInTheDocument();
  });
});
