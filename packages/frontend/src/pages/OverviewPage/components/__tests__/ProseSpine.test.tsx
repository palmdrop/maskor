import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { ProseSpine } from "../ProseSpine";

const fragment = (uuid: string): FragmentSummary => ({
  uuid,
  key: uuid,
  isDiscarded: false,
  excerpt: null,
  aspects: {},
});

const baseProps = {
  sectionsData: [{ uuid: "s1", name: "Opening", fragmentUuids: ["frag-1"] }],
  detailLevel: "title" as const,
  fragmentByUuid: new Map([["frag-1", fragment("frag-1")]]),
  contentByFragmentUuid: new Map([["frag-1", "body"]]),
  selectedFragmentUuids: new Set<string>(),
  highlightedFragmentUuids: new Set<string>(),
  onSelectFragment: vi.fn(),
  onRemoveFragment: vi.fn(),
  onEdit: vi.fn(),
};

const wrap = (ui: ReactNode) => render(<DndContext>{ui}</DndContext>);

describe("ProseSpine", () => {
  it("shows drag handle and remove affordance for a writable sequence", () => {
    wrap(<ProseSpine {...baseProps} />);
    expect(screen.getByRole("button", { name: 'Drag to reorder "frag-1"' })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'Remove "frag-1" from sequence' }),
    ).toBeInTheDocument();
  });

  it("hides the drag handle and remove affordance when read-only", () => {
    // The Overview passes no onRemoveFragment for a read-only import-sequence;
    // readOnly additionally suppresses the drag handle.
    wrap(<ProseSpine {...baseProps} onRemoveFragment={undefined} readOnly />);
    expect(
      screen.queryByRole("button", { name: 'Drag to reorder "frag-1"' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: 'Remove "frag-1" from sequence' }),
    ).not.toBeInTheDocument();
  });
});
