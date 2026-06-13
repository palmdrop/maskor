import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { ReorderList } from "../ReorderList";
import type { SectionData } from "../reorder-types";

const fragment = (uuid: string): FragmentSummary => ({
  uuid,
  key: uuid,
  isDiscarded: false,
  excerpt: null,
  aspects: {},
});

const sectionsData: SectionData[] = [{ uuid: "s1", name: "Opening", fragmentUuids: ["frag-1"] }];

const fragmentByUuid = new Map([
  ["frag-1", fragment("frag-1")],
  ["pool-1", fragment("pool-1")],
]);

const baseProps = {
  sectionsData,
  poolFragmentUuids: ["pool-1"],
  colorByAspectKey: new Map<string, string>(),
  fragmentByUuid,
  selectedFragmentUuids: new Set<string>(),
  onSelectFragment: vi.fn(),
  onRemoveFragment: vi.fn(),
  getViolationTooltips: () => [],
  getCycleTooltips: () => [],
  editingSectionId: null,
  setEditingSectionId: vi.fn(),
  editingSectionValue: "",
  setEditingSectionValue: vi.fn(),
  confirmingDeleteSectionId: null,
  setConfirmingDeleteSectionId: vi.fn(),
  handleSectionRenameCommit: vi.fn(),
  handleSectionRenameKeyDown: vi.fn(),
  onDeleteSection: vi.fn(),
  onMergeUp: vi.fn(),
  onMergeDown: vi.fn(),
  hasSequence: true,
  createSectionPending: false,
  onAddSection: vi.fn(),
};

const wrap = (ui: ReactNode) => render(<DndContext>{ui}</DndContext>);

describe("ReorderList", () => {
  it("shows the pool and add-section affordance for a writable sequence", () => {
    wrap(<ReorderList {...baseProps} />);
    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add section" })).toBeInTheDocument();
  });

  it("hides the pool, add-section and section editing when read-only", () => {
    wrap(<ReorderList {...baseProps} readOnly />);
    expect(screen.queryByText("Pool")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add section" })).not.toBeInTheDocument();
    // The section name renders as static text, not an editable rename button.
    expect(screen.queryByRole("button", { name: "Opening" })).not.toBeInTheDocument();
    expect(screen.getByText("Opening")).toBeInTheDocument();
  });

  it("hides section management but keeps the pool when controls are off (arranger mode)", () => {
    wrap(<ReorderList {...baseProps} showSectionControls={false} />);
    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add section" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opening" })).not.toBeInTheDocument();
  });

  it("renders both sections and pool side by side in split layout", () => {
    wrap(<ReorderList {...baseProps} showSectionControls={false} layout="split" />);
    expect(screen.getByText("Opening")).toBeInTheDocument();
    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.getByText("frag-1")).toBeInTheDocument();
    expect(screen.getByText("pool-1")).toBeInTheDocument();
  });
});
