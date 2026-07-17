import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { ReorderRow } from "../ReorderRow";

const fragment = (overrides: Partial<FragmentSummary> = {}): FragmentSummary => ({
  uuid: "frag-1",
  key: "scene-1",
  isDiscarded: false,
  excerpt: null,
  aspects: {},
  ...overrides,
});

// useSortable requires a DndContext + SortableContext ancestor.
const wrap = (ui: ReactNode) =>
  render(
    <DndContext>
      <SortableContext items={["frag-1"]}>{ui}</SortableContext>
    </DndContext>,
  );

const baseProps = {
  colorByAspectKey: new Map<string, string>(),
  violationTooltips: [],
  cycleTooltips: [],
  isSelected: false,
  onSelect: vi.fn(),
};

describe("ReorderRow", () => {
  it("renders the fragment key and selects on click", () => {
    const onSelect = vi.fn();
    wrap(<ReorderRow {...baseProps} fragment={fragment()} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("scene-1"));
    expect(onSelect).toHaveBeenCalledWith("frag-1", expect.any(Object));
  });

  it("omits the remove affordance when onRemove is not provided", () => {
    wrap(<ReorderRow {...baseProps} fragment={fragment()} />);
    expect(screen.queryByRole("button", { name: /Remove "scene-1"/ })).not.toBeInTheDocument();
  });

  it("renders the remove affordance and calls onRemove when provided", () => {
    const onRemove = vi.fn();
    wrap(<ReorderRow {...baseProps} fragment={fragment()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove "scene-1" from sequence/ }));
    expect(onRemove).toHaveBeenCalledWith("frag-1");
  });

  it("hides the remove affordance when disabled (read-only)", () => {
    const onRemove = vi.fn();
    wrap(<ReorderRow {...baseProps} fragment={fragment()} onRemove={onRemove} disabled />);
    expect(
      screen.queryByRole("button", { name: /Remove "scene-1" from sequence/ }),
    ).not.toBeInTheDocument();
  });

  it("marks the row highlighted, coexisting with selection", () => {
    const { container } = wrap(
      <ReorderRow {...baseProps} fragment={fragment()} isSelected isHighlighted />,
    );
    const row = container.querySelector('[data-fragment-uuid="frag-1"]')!;
    expect(row).toHaveAttribute("data-highlighted", "true");
    // The selection styling still applies alongside the highlight.
    expect(row.className).toMatch(/border-primary/);
  });

  it("is not marked highlighted when not highlighted", () => {
    const { container } = wrap(<ReorderRow {...baseProps} fragment={fragment()} />);
    expect(container.querySelector('[data-fragment-uuid="frag-1"]')).not.toHaveAttribute(
      "data-highlighted",
    );
  });

  it("reports fragment hover on mouse enter and leave", () => {
    const onHoverFragment = vi.fn();
    const { container } = wrap(
      <ReorderRow {...baseProps} fragment={fragment()} onHoverFragment={onHoverFragment} />,
    );
    const row = container.querySelector('[data-fragment-uuid="frag-1"]')!;
    fireEvent.mouseEnter(row);
    expect(onHoverFragment).toHaveBeenCalledWith("frag-1");
    fireEvent.mouseLeave(row);
    expect(onHoverFragment).toHaveBeenCalledWith(null);
  });

  it("marks a soft fragment-hover distinctly from the sequence-highlight ring", () => {
    const { container } = wrap(
      <ReorderRow {...baseProps} fragment={fragment()} isFragmentHovered />,
    );
    const row = container.querySelector('[data-fragment-uuid="frag-1"]')!;
    expect(row).toHaveAttribute("data-fragment-hovered", "true");
    // Soft hover is not the sky ring used for the sequence-level highlight.
    expect(row.className).not.toMatch(/ring-2/);
  });
});
