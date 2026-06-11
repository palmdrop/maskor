import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FragmentSummary, Sequence } from "@api/generated/maskorAPI.schemas";
import { FragmentDetailPanel } from "../FragmentDetailPanel";

const fragment = (overrides: Partial<FragmentSummary> = {}): FragmentSummary => ({
  uuid: "frag-1",
  key: "scene-1",
  isDiscarded: false,
  excerpt: null,
  aspects: {},
  ...overrides,
});

const mainSequenceWith = (fragmentUuid: string): Sequence => ({
  uuid: "seq-main",
  name: "Manuscript",
  isMain: true,
  active: true,
  projectUuid: "p1",
  filePath: "main.yaml",
  contentHash: "hash",
  sections: [
    { uuid: "sec-1", name: "Act I", fragments: [{ uuid: "pos-1", fragmentUuid, position: 0 }] },
  ],
});

const baseProps = {
  violations: [],
  fragmentByUuid: new Map<string, FragmentSummary>(),
  onOpen: vi.fn(),
};

describe("FragmentDetailPanel", () => {
  it("shows the empty placements state when the fragment is unplaced", () => {
    render(<FragmentDetailPanel {...baseProps} fragment={fragment()} sequences={[]} />);
    expect(screen.getByText("Not placed in any sequence.")).toBeInTheDocument();
  });

  it("renders the server excerpt read-only without an editor", () => {
    render(
      <FragmentDetailPanel
        {...baseProps}
        fragment={fragment({ excerpt: "A quiet opening line." })}
        sequences={[]}
      />,
    );
    expect(screen.getByText("A quiet opening line.")).toBeInTheDocument();
    // The right panel is read-only — no inline edit affordance.
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lists placements with the main badge when placed in the main sequence", () => {
    render(
      <FragmentDetailPanel
        {...baseProps}
        fragment={fragment()}
        sequences={[mainSequenceWith("frag-1")]}
      />,
    );
    expect(screen.getByText("Manuscript")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.queryByText("Not placed in any sequence.")).not.toBeInTheDocument();
  });

  it("fires onOpen and onRemoveFragment from the action buttons", () => {
    const onOpen = vi.fn();
    const onRemoveFragment = vi.fn();
    render(
      <FragmentDetailPanel
        {...baseProps}
        fragment={fragment()}
        sequences={[]}
        onOpen={onOpen}
        onRemoveFragment={onRemoveFragment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open fragment" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from sequence" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRemoveFragment).toHaveBeenCalledWith("frag-1");
  });
});
