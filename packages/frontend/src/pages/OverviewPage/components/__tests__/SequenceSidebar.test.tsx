import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import type { Sequence } from "@api/generated/maskorAPI.schemas";

const PROJECT_ID = "project-uuid-1";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useParams: () => ({ projectId: PROJECT_ID }), useNavigate: () => vi.fn() };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

const updateMutate = vi.fn();

vi.mock("@api/generated/sequences/sequences", () => ({
  useCreateSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateSequence: vi.fn(() => ({ mutate: updateMutate, mutateAsync: vi.fn(), isPending: false })),
  useDeleteSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListSequencesQueryKey: () => [`/projects/${PROJECT_ID}/sequences`],
}));

const { SequenceSidebar } = await import("../SequenceSidebar");

const makeSequence = (overrides: Partial<Sequence>): Sequence => ({
  uuid: "seq-x",
  name: "A sequence",
  isMain: false,
  active: true,
  projectUuid: PROJECT_ID,
  filePath: "seq-x.yaml",
  contentHash: "hash",
  sections: [],
  ...overrides,
});

const wrap = ({ children }: { children: ReactNode }) => <CommandsProvider>{children}</CommandsProvider>;

describe("SequenceSidebar — active toggle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates an inactive import-sequence via the toggle button", () => {
    const importSequence = makeSequence({
      uuid: "import-seq",
      name: "Import: doc.md",
      active: false,
      origin: {
        fileName: "doc.md",
        archivePath: ".maskor/imports/import-seq.md",
        format: "markdown",
        importedAt: "2026-05-31T10:00:00.000Z",
      },
    });

    render(
      <SequenceSidebar
        sequences={[makeSequence({ uuid: "main", name: "Main", isMain: true }), importSequence]}
        violations={[]}
        cycles={[]}
        activeSequenceId={undefined}
      />,
      { wrapper: wrap },
    );

    // Inactive sequence shows an "imported" badge and an Activate control.
    expect(screen.getByText("imported")).toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: /Activate sequence "Import: doc.md" as a constraint/i,
    });
    fireEvent.click(toggle);

    expect(updateMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: "import-seq",
      data: { active: true },
    });
  });

  it("deactivates an active secondary via the toggle button", () => {
    const secondary = makeSequence({ uuid: "sec", name: "Side order", active: true });

    render(
      <SequenceSidebar
        sequences={[makeSequence({ uuid: "main", name: "Main", isMain: true }), secondary]}
        violations={[]}
        cycles={[]}
        activeSequenceId={undefined}
      />,
      { wrapper: wrap },
    );

    const toggle = screen.getByRole("button", {
      name: /Deactivate sequence "Side order" as a constraint/i,
    });
    fireEvent.click(toggle);

    expect(updateMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: "sec",
      data: { active: false },
    });
  });
});
