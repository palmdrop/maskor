import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/mock">{children}</a>,
}));

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

    render(<FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} />);

    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Act One")).toBeInTheDocument();
    expect(screen.getByText("(main)")).toBeInTheDocument();
    expect(screen.queryByText("Alt")).not.toBeInTheDocument();
  });

  it("shows an empty state when the fragment is not placed anywhere", () => {
    (useListSequences as Mock).mockReturnValue({
      data: makeBundle([{ uuid: "s1", name: "Main", isMain: true, sectionFragments: ["other"] }]),
    });

    render(<FragmentSequenceMembership projectId="proj-1" fragmentId={FRAG} />);

    expect(screen.getByText("Not placed in any sequence.")).toBeInTheDocument();
  });
});
