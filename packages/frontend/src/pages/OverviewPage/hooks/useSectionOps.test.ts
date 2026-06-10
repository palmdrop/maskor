import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionOps } from "./useSectionOps";

const PROJECT_ID = "p1";
const SEQUENCE = { uuid: "seq-1" };

// sec-1: [a, b], sec-2: [c, d, e]
const sectionsData = [
  { uuid: "sec-1", name: "One", fragmentUuids: ["a", "b"] },
  { uuid: "sec-2", name: "Two", fragmentUuids: ["c", "d", "e"] },
];
const allSequenceFragmentUuids = ["a", "b", "c", "d", "e"];
const fragmentByUuid = new Map(
  allSequenceFragmentUuids.map((uuid) => [uuid, { key: `key-${uuid}` }]),
);

const makeMutations = () => ({
  placeFragment: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  moveFragment: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  unplaceFragment: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  moveSection: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  groupFragments: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  moveFragments: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  splitSection: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  mergeSection: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
});

let mutations: ReturnType<typeof makeMutations>;

const render = (placedSelection: string[]) =>
  renderHook(() =>
    useSectionOps({
      projectId: PROJECT_ID,
      sequence: SEQUENCE,
      sectionsData,
      placedSelection,
      allSequenceFragmentUuids,
      fragmentByUuid,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mutations: mutations as any,
    }),
  );

describe("useSectionOps", () => {
  beforeEach(() => {
    mutations = makeMutations();
  });

  it("derives split guards at section boundaries", () => {
    expect(render(["a"]).result.current.canSplitBefore).toBe(false); // first in section
    expect(render(["a"]).result.current.canSplitAfter).toBe(true);

    expect(render(["b"]).result.current.canSplitBefore).toBe(true); // last in sec-1
    expect(render(["b"]).result.current.canSplitAfter).toBe(false);

    expect(render(["d"]).result.current.canSplitBefore).toBe(true); // middle of sec-2
    expect(render(["d"]).result.current.canSplitAfter).toBe(true);
  });

  it("has no split context unless exactly one fragment is selected", () => {
    expect(render([]).result.current.splitContext).toBeUndefined();
    expect(render(["a", "b"]).result.current.splitContext).toBeUndefined();
    expect(render(["a"]).result.current.splitContext?.fragmentUuid).toBe("a");
  });

  it("split before/after target the fragment and its successor", async () => {
    const { result } = render(["d"]); // sec-2: [c, d, e] — d is middle
    await act(async () => {
      await result.current.splitBefore();
    });
    expect(mutations.splitSection.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { fragmentUuid: "d", name: "" } }),
    );

    await act(async () => {
      await result.current.splitAfter();
    });
    expect(mutations.splitSection.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { fragmentUuid: "e", name: "" } }),
    );
  });

  it("derives the mergeable section lists (up drops first, down drops last)", () => {
    const { result } = render([]);
    expect(result.current.mergeableUpSections.map((s) => s.uuid)).toEqual(["sec-2"]);
    expect(result.current.mergeableDownSections.map((s) => s.uuid)).toEqual(["sec-1"]);
  });

  it("merge up targets the previous section; merge down targets this section", async () => {
    const { result } = render([]);
    await act(async () => {
      await result.current.mergeSectionUp("sec-2");
    });
    expect(mutations.mergeSection.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ sectionId: "sec-1" }),
    );

    await act(async () => {
      await result.current.mergeSectionDown("sec-1");
    });
    expect(mutations.mergeSection.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ sectionId: "sec-1" }),
    );
  });

  it("moves the selection to the end of the target section", async () => {
    const { result } = render(["a"]);
    await act(async () => {
      await result.current.moveSelectionToSection("sec-2");
    });
    // sec-2 has 3 fragments → new position is 3.
    expect(mutations.moveFragments.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { fragmentUuids: ["a"], sectionUuid: "sec-2", position: 3 },
      }),
    );
  });

  it("derives placedFragmentsForUnplace with fragment keys", () => {
    const { result } = render([]);
    expect(result.current.placedFragmentsForUnplace).toEqual([
      { uuid: "a", key: "key-a" },
      { uuid: "b", key: "key-b" },
      { uuid: "c", key: "key-c" },
      { uuid: "d", key: "key-d" },
      { uuid: "e", key: "key-e" },
    ]);
  });

  it("groupSelection groups the placed selection", async () => {
    const { result } = render(["a", "b"]);
    await act(async () => {
      await result.current.groupSelection();
    });
    expect(mutations.groupFragments.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: { fragmentUuids: ["a", "b"], name: "" } }),
    );
  });
});
