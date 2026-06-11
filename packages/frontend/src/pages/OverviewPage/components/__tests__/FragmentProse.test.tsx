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
