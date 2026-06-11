import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Cycle, FragmentSummary, Sequence, Violation } from "@api/generated/maskorAPI.schemas";
import { ProjectWarningsPanel } from "../ProjectWarningsPanel";

const sequence = (uuid: string, name: string): Sequence => ({
  uuid,
  name,
  isMain: false,
  active: true,
  projectUuid: "p1",
  filePath: `${uuid}.yaml`,
  contentHash: "hash",
  sections: [],
});

const emptyFragments = new Map<string, FragmentSummary>();

describe("ProjectWarningsPanel", () => {
  it("reports no conflicts when there are none", () => {
    render(
      <ProjectWarningsPanel
        sequences={[]}
        violations={[]}
        cycles={[]}
        fragmentByUuid={emptyFragments}
        onNavigateToSequence={vi.fn()}
      />,
    );
    expect(screen.getByText("No constraint conflicts.")).toBeInTheDocument();
    expect(screen.queryByText("Cycles")).not.toBeInTheDocument();
    expect(screen.queryByText("Violations")).not.toBeInTheDocument();
  });

  it("lists violations and navigates on click", () => {
    const onNavigateToSequence = vi.fn();
    const violations = [
      { fragmentUuid: "f1", predecessorUuid: "f0", secondaryUuid: "seq-2" },
    ] as Violation[];
    render(
      <ProjectWarningsPanel
        sequences={[sequence("seq-2", "Chronology")]}
        violations={violations}
        cycles={[]}
        fragmentByUuid={emptyFragments}
        onNavigateToSequence={onNavigateToSequence}
      />,
    );
    expect(screen.getByText("Violations")).toBeInTheDocument();
    expect(screen.queryByText("No constraint conflicts.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chronology" }));
    expect(onNavigateToSequence).toHaveBeenCalledWith("seq-2");
  });

  it("lists cycles", () => {
    const cycles = [{ sequenceUuids: ["seq-2"], fragmentUuids: ["f1"] }] as Cycle[];
    render(
      <ProjectWarningsPanel
        sequences={[sequence("seq-2", "Chronology")]}
        violations={[]}
        cycles={cycles}
        fragmentByUuid={emptyFragments}
        onNavigateToSequence={vi.fn()}
      />,
    );
    expect(screen.getByText("Cycles")).toBeInTheDocument();
  });
});
