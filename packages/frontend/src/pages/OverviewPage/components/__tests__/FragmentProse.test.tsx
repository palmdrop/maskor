import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@components/readonly-prose", () => ({
  ReadonlyProse: ({ content }: { content: string }) => (
    <div data-testid="readonly-prose">{content}</div>
  ),
}));

const { FragmentProse } = await import("../FragmentProse");

const FRAGMENT_UUID = "frag-uuid-1";

// Inline editing is gone (ADR 0013): the spine never edits in place. Double-click
// and the pencil now hand off to the host via onEdit, which opens the full editor
// overlay. FragmentProse itself just reads.
describe("FragmentProse — edit handoff", () => {
  it("renders no edit affordance when onEdit is absent", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("the pencil calls onEdit with the fragment uuid", () => {
    const onEdit = vi.fn();
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    expect(onEdit).toHaveBeenCalledWith(FRAGMENT_UUID);
  });

  it("double-clicking the container calls onEdit", () => {
    const onEdit = vi.fn();
    const { container } = render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onEdit={onEdit}
      />,
    );

    fireEvent.doubleClick(container.firstChild as Element);
    expect(onEdit).toHaveBeenCalledWith(FRAGMENT_UUID);
  });

  it("single click selects the fragment without editing", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onSelect={onSelect}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(container.firstChild as Element);
    expect(onSelect).toHaveBeenCalledWith(FRAGMENT_UUID);
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("FragmentProse — title-mode length bar", () => {
  it("renders a bar sized to relativeLength at the title detail level", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="title"
        relativeLength={0.5}
      />,
    );
    expect(screen.getByTestId("fragment-length-bar")).toHaveStyle({ width: "50%" });
  });

  it("keeps a minimum visible width for near-empty fragments", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="a"
        isDiscarded={false}
        detailLevel="title"
        relativeLength={0.001}
      />,
    );
    expect(screen.getByTestId("fragment-length-bar")).toHaveStyle({ width: "1.5%" });
  });

  it("renders no bar when relativeLength is absent", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="title"
      />,
    );
    expect(screen.queryByTestId("fragment-length-bar")).not.toBeInTheDocument();
  });

  it("renders no bar outside the title detail level", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
        relativeLength={0.5}
      />,
    );
    expect(screen.queryByTestId("fragment-length-bar")).not.toBeInTheDocument();
  });
});

describe("FragmentProse — hover highlight", () => {
  it("marks the entry highlighted, alongside the selection border", () => {
    const { container } = render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
        isSelected
        isHighlighted
      />,
    );
    const root = container.firstChild as Element;
    expect(root).toHaveAttribute("data-highlighted", "true");
    // The selection styling still applies alongside the highlight.
    expect(root.className).toMatch(/border-primary/);
  });

  it("is not marked highlighted when not highlighted", () => {
    const { container } = render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(container.firstChild as Element).not.toHaveAttribute("data-highlighted");
  });

  it("reports fragment hover and marks a soft cross-highlight", () => {
    const onHoverFragment = vi.fn();
    const { container } = render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
        isFragmentHovered
        onHoverFragment={onHoverFragment}
      />,
    );
    const root = container.firstChild as Element;
    expect(root).toHaveAttribute("data-fragment-hovered", "true");
    fireEvent.mouseEnter(root);
    expect(onHoverFragment).toHaveBeenCalledWith(FRAGMENT_UUID);
    fireEvent.mouseLeave(root);
    expect(onHoverFragment).toHaveBeenCalledWith(null);
  });
});

describe("FragmentProse — remove from sequence", () => {
  it("renders no remove affordance when onRemove is absent", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Remove "frag-one" from sequence/i }),
    ).not.toBeInTheDocument();
  });

  it("invokes onRemove when the trash affordance is clicked", () => {
    const onRemove = vi.fn();
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove "frag-one" from sequence/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
