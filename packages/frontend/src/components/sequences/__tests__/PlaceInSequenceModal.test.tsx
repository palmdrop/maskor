import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const placeMutate = vi.fn();
const moveMutate = vi.fn();
const unplaceMutate = vi.fn();
const createSectionMutate = vi.fn();
const deleteSectionMutate = vi.fn();

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: vi.fn(),
  usePlaceFragment: vi.fn(() => ({ mutate: placeMutate, isPending: false })),
  useMoveFragment: vi.fn(() => ({ mutate: moveMutate, isPending: false })),
  useUnplaceFragment: vi.fn(() => ({ mutate: unplaceMutate, isPending: false })),
  useReorderSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateSection: vi.fn(() => ({ mutate: createSectionMutate, isPending: false })),
  useDeleteSection: vi.fn(() => ({ mutate: deleteSectionMutate, isPending: false })),
  getListSequencesQueryKey: (projectId: string) => [`/projects/${projectId}/sequences`],
}));

vi.mock("@api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: vi.fn(),
}));

const { useListSequences } = await import("@api/generated/sequences/sequences");
const { useListFragmentSummaries } = await import("@api/generated/fragments/fragments");
const { PlaceInSequenceModal } = await import("../PlaceInSequenceModal");

const PROJECT_ID = "proj-1";
const SEQUENCE_ID = "seq-1";
const FRAG = "frag-active";

const makeBundle = (sections: { uuid: string; fragmentUuids: string[] }[]) => ({
  status: 200 as const,
  data: {
    sequences: [
      {
        uuid: SEQUENCE_ID,
        name: "Main",
        isMain: true,
        active: true,
        projectUuid: PROJECT_ID,
        filePath: `${SEQUENCE_ID}.yaml`,
        contentHash: "hash",
        sections: sections.map((section) => ({
          uuid: section.uuid,
          name: section.uuid,
          fragments: section.fragmentUuids.map((uuid, index) => ({
            uuid: `pos-${section.uuid}-${index}`,
            fragmentUuid: uuid,
            position: index,
          })),
        })),
      },
    ],
    violations: [],
    cycles: [],
  },
});

const makeSummaries = (uuids: string[]) => ({
  status: 200 as const,
  data: uuids.map((uuid) => ({ uuid, key: uuid, isDiscarded: false, excerpt: null, aspects: {} })),
});

const renderModal = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlaceInSequenceModal
        projectId={PROJECT_ID}
        fragmentId={FRAG}
        sequenceId={SEQUENCE_ID}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );

const setData = (
  bundle: ReturnType<typeof makeBundle>,
  summaries: ReturnType<typeof makeSummaries>,
) => {
  (useListSequences as Mock).mockReturnValue({ data: bundle });
  (useListFragmentSummaries as Mock).mockReturnValue({ data: summaries });
};

describe("PlaceInSequenceModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an unplaced fragment to the (only) section at the end", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["other"] }]), makeSummaries([FRAG, "other"]));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Add to sequence" }));

    expect(placeMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      data: { fragmentUuid: FRAG, sectionUuid: "s1", position: 1 },
    });
  });

  it("removes a placed fragment", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG] }]), makeSummaries([FRAG]));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(unplaceMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
    });
  });

  it("moves a placed fragment forward across a section boundary", () => {
    setData(
      makeBundle([
        { uuid: "s1", fragmentUuids: [FRAG] },
        { uuid: "s2", fragmentUuids: ["x"] },
      ]),
      makeSummaries([FRAG, "x"]),
    );
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Move right" }));

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s2", position: 0 },
    });
  });

  it("adds a section", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [] }]), makeSummaries([FRAG]));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    expect(createSectionMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      data: { name: "" },
    });
  });

  it("disables section deletion when only one section remains", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG] }]), makeSummaries([FRAG]));
    renderModal();

    expect(screen.getByRole("button", { name: "Delete section" })).toBeDisabled();
  });

  it("moves the placed fragment with the left arrow key", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["x", FRAG] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s1", position: 0 },
    });
  });
});
