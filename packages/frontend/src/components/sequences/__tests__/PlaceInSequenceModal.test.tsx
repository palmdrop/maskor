import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const placeMutate = vi.fn();
const moveMutate = vi.fn();
const unplaceMutate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <a href="/mock" onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("@api/generated/sequences/sequences", () => ({
  useListSequences: vi.fn(),
  useGetSequenceContents: vi.fn(),
  usePlaceFragment: vi.fn(() => ({ mutate: placeMutate, isPending: false })),
  useMoveFragment: vi.fn(() => ({ mutate: moveMutate, isPending: false })),
  useUnplaceFragment: vi.fn(() => ({ mutate: unplaceMutate, isPending: false })),
  useReorderSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useGroupFragments: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useMoveFragments: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSplitSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useMergeSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  getListSequencesQueryKey: (projectId: string) => [`/projects/${projectId}/sequences`],
}));

vi.mock("@api/generated/fragments/fragments", () => ({
  useListFragmentSummaries: vi.fn(),
}));

vi.mock("@api/generated/projects/projects", () => ({
  useGetProject: vi.fn(),
}));

const { useListSequences, useGetSequenceContents } =
  await import("@api/generated/sequences/sequences");
const { useListFragmentSummaries } = await import("@api/generated/fragments/fragments");
const { useGetProject } = await import("@api/generated/projects/projects");
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

const setVimMode = (vimMode: boolean) => {
  (useGetProject as Mock).mockReturnValue({
    data: { status: 200, data: { editor: { vimMode } } },
  });
};

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
    setVimMode(false);
    (useGetSequenceContents as Mock).mockReturnValue({ data: undefined });
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

    fireEvent.click(screen.getByRole("button", { name: "Move down" }));

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s2", position: 0 },
    });
  });

  it("moves a placed fragment forward within its section", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG, "x"] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Move down" }));

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s1", position: 1 },
    });
  });

  it("does not offer section management (drag-arrange only)", () => {
    setData(
      makeBundle([
        { uuid: "s1", fragmentUuids: ["x"] },
        { uuid: "s2", fragmentUuids: [FRAG] },
      ]),
      makeSummaries([FRAG, "x"]),
    );
    renderModal();

    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete section" })).toBeNull();
  });

  it("shows the unassigned pool so a fragment can be dragged in", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["x"] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    // The active (unplaced) fragment appears in the pool region.
    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.getByText(FRAG)).toBeInTheDocument();
  });

  it("moves the placed fragment up with the up arrow key", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["x", FRAG] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    // Keyboard handling lives on the arranger container; fire from a row inside it
    // so the event bubbles up to the handler (firing on the dialog would not).
    const activeRow = document.querySelector(`[data-fragment-uuid="${FRAG}"]`)!;
    fireEvent.keyDown(activeRow, { key: "ArrowUp" });

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s1", position: 0 },
    });
  });

  it("ignores the vim k key when vim mode is off", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["x", FRAG] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    const activeRow = document.querySelector(`[data-fragment-uuid="${FRAG}"]`)!;
    fireEvent.keyDown(activeRow, { key: "k" });

    expect(moveMutate).not.toHaveBeenCalled();
  });

  it("moves the placed fragment up with the vim k key when vim mode is on", () => {
    setVimMode(true);
    setData(makeBundle([{ uuid: "s1", fragmentUuids: ["x", FRAG] }]), makeSummaries([FRAG, "x"]));
    renderModal();

    const activeRow = document.querySelector(`[data-fragment-uuid="${FRAG}"]`)!;
    fireEvent.keyDown(activeRow, { key: "k" });

    expect(moveMutate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      sequenceId: SEQUENCE_ID,
      fragmentUuid: FRAG,
      data: { sectionUuid: "s1", position: 0 },
    });
  });

  it("renders a length bar per row sized relative to the longest fragment", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG, "x"] }]), makeSummaries([FRAG, "x"]));
    (useGetSequenceContents as Mock).mockReturnValue({
      data: {
        status: 200,
        data: {
          placed: [
            { fragmentUuid: FRAG, content: "ab" },
            { fragmentUuid: "x", content: "abcd" },
          ],
          pool: [],
        },
      },
    });
    renderModal();

    const bars = screen.getAllByTestId("fragment-length-bar");
    expect(bars).toHaveLength(2);
    const widths = bars.map((bar) => bar.style.width);
    expect(widths).toContain("50%");
    expect(widths).toContain("100%");
  });

  it("shows no length bars when the sequence contents have not loaded", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG] }]), makeSummaries([FRAG]));
    renderModal();

    expect(screen.queryAllByTestId("fragment-length-bar")).toHaveLength(0);
  });

  it("offers an Open in Overview link that closes the modal", () => {
    setData(makeBundle([{ uuid: "s1", fragmentUuids: [FRAG] }]), makeSummaries([FRAG]));
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PlaceInSequenceModal
          projectId={PROJECT_ID}
          fragmentId={FRAG}
          sequenceId={SEQUENCE_ID}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: /Open in Overview/ }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
