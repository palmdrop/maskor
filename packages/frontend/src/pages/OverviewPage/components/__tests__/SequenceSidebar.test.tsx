import { describe, it, expect, vi, beforeEach } from "vitest";
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
const cloneMutate = vi.fn();
const insertMutate = vi.fn();

vi.mock("@api/generated/sequences/sequences", () => ({
  useCreateSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateSequence: vi.fn(() => ({
    mutate: updateMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useDeleteSequence: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCloneSequence: vi.fn(() => ({ mutate: cloneMutate, isPending: false })),
  useInsertSequence: vi.fn(() => ({ mutate: insertMutate, isPending: false })),
  getListSequencesQueryKey: () => [`/projects/${PROJECT_ID}/sequences`],
  getGetSequenceContentsQueryKey: () => [`/projects/${PROJECT_ID}/sequences/contents`],
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

const wrap = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

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

describe("SequenceSidebar — clone / insert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clones a sequence with a generated '(copy)' name via the clone button", () => {
    render(
      <SequenceSidebar
        sequences={[makeSequence({ uuid: "main", name: "Main", isMain: true })]}
        violations={[]}
        cycles={[]}
        activeSequenceId={undefined}
      />,
      { wrapper: wrap },
    );

    const clone = screen.getByRole("button", { name: /Clone sequence "Main"/i });
    fireEvent.click(clone);

    expect(cloneMutate).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, sequenceId: "main", data: { name: "Main (copy)" } },
      expect.anything(),
    );
  });

  it("inserts a source sequence into the open target at the tail section index", () => {
    const main = makeSequence({
      uuid: "main",
      name: "Main",
      isMain: true,
      sections: [
        { uuid: "s1", name: "One", fragments: [] },
        { uuid: "s2", name: "Two", fragments: [] },
      ],
    });
    const secondary = makeSequence({ uuid: "sec", name: "Side order" });

    render(
      <SequenceSidebar
        sequences={[main, secondary]}
        violations={[]}
        cycles={[]}
        activeSequenceId={undefined}
      />,
      { wrapper: wrap },
    );

    // The non-target row (the secondary) offers an insert-into-target control.
    const insert = screen.getByRole("button", {
      name: /Insert sequence "Side order" into "Main"/i,
    });
    fireEvent.click(insert);

    expect(insertMutate).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        sequenceId: "main",
        data: { sourceSequenceId: "sec", sectionIndex: 2 },
      },
      expect.anything(),
    );
  });
});
