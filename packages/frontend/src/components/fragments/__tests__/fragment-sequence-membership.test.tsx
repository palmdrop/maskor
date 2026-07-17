import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: vi.fn(),
}));

const { useListSequences } = await import("@api/generated/sequences/sequences");
const { FragmentSequenceMembership } = await import("../fragment-sequence-membership");

const FRAG = "frag-active";

const makeBundle = (
  sequences: { uuid: string; name: string; isMain: boolean; sectionFragments: string[] }[],
) => ({
  status: 200 as const,
  data: {
    sequences: sequences.map((sequence) => ({
      uuid: sequence.uuid,
      name: sequence.name,
      isMain: sequence.isMain,
      active: true,
      projectUuid: "proj-1",
      filePath: `${sequence.uuid}.yaml`,
      contentHash: "hash",
      sections: [
        {
          uuid: `${sequence.uuid}-sec`,
          name: "Act One",
          fragments: sequence.sectionFragments.map((uuid, index) => ({
            uuid: `pos-${index}`,
            fragmentUuid: uuid,
            position: index,
          })),
        },
      ],
    })),
    violations: [],
    cycles: [],
  },
});

describe("FragmentSequenceMembership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists each sequence the fragment is placed in with its section", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([
        { uuid: "s1", name: "Main", isMain: true, sectionFragments: [FRAG] },
        { uuid: "s2", name: "Alt", isMain: false, sectionFragments: ["other"] },
      ]),
    });

    render(
      <FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} onOpenSequence={vi.fn()} />,
    );

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Act One")).toBeInTheDocument();
    expect(screen.getByText("(main)")).toBeInTheDocument();
    expect(screen.queryByText("Alt")).not.toBeInTheDocument();
  });

  it("renders a position indicator reflecting the fragment's place in the sequence", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([
        { uuid: "s1", name: "Main", isMain: true, sectionFragments: ["a", FRAG, "b", "c"] },
      ]),
    });

    render(
      <FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} onOpenSequence={vi.fn()} />,
    );

    const indicator = screen.getByRole("img", { name: "Position 2 of 4" });
    expect(indicator).toBeInTheDocument();
    const tick = indicator.firstElementChild as HTMLElement;
    // Index 1 of 4 → 1/3 of the way along the track.
    expect(tick.style.left).toBe(`${((1 / 3) * 100).toString()}%`);
  });

  it("counts positions across all sections, in section order", () => {
    const bundle = makeBundle([
      { uuid: "s1", name: "Main", isMain: true, sectionFragments: ["a", "b"] },
    ]);
    bundle.data.sequences[0]!.sections.push({
      uuid: "s1-sec-2",
      name: "Act Two",
      fragments: [{ uuid: "pos-last", fragmentUuid: FRAG, position: 0 }],
    });
    (useListSequences as Mock).mockReturnValue({ data: bundle });

    render(
      <FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} onOpenSequence={vi.fn()} />,
    );

    const indicator = screen.getByRole("img", { name: "Position 3 of 3" });
    const tick = indicator.firstElementChild as HTMLElement;
    // Last fragment → tick at the far right.
    expect(tick.style.left).toBe("100%");
  });

  it("centers the tick when the fragment is the only one in the sequence", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([{ uuid: "s1", name: "Main", isMain: true, sectionFragments: [FRAG] }]),
    });

    render(
      <FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} onOpenSequence={vi.fn()} />,
    );

    const indicator = screen.getByRole("img", { name: "Position 1 of 1" });
    const tick = indicator.firstElementChild as HTMLElement;
    expect(tick.style.left).toBe("50%");
  });

  it("opens the clicked sequence via onOpenSequence", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([{ uuid: "s1", name: "Main", isMain: true, sectionFragments: [FRAG] }]),
    });
    const onOpenSequence = vi.fn();

    render(
      <FragmentSequenceMembership
        projectId="proj-1"
        fragmentId={FRAG}
        onOpenSequence={onOpenSequence}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Main/ }));

    expect(onOpenSequence).toHaveBeenCalledWith("s1");
  });

  it("shows an empty state when the fragment is not placed anywhere", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([{ uuid: "s1", name: "Main", isMain: true, sectionFragments: ["other"] }]),
    });

    render(
      <FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} onOpenSequence={vi.fn()} />,
    );

    expect(screen.getByText("Not placed in any sequence.")).toBeInTheDocument();
  });
});
