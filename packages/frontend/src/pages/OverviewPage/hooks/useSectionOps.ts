import { useCallback, useMemo } from "react";
import type { useSequenceMutations } from "@lib/sequences/useSequenceMutations";

type SequenceMutations = ReturnType<typeof useSequenceMutations>;

type SectionData = { uuid: string; name: string; fragmentUuids: string[] };

type NamedSection = { uuid: string; name: string };

export type SplitContext = {
  fragmentUuid: string;
  nextFragmentUuid: string | undefined;
  isFirst: boolean;
  isLast: boolean;
};

type Args = {
  projectId: string;
  sequence: { uuid: string } | undefined;
  sectionsData: SectionData[];
  /** The placed members of the current selection (pool fragments don't take section ops). */
  placedSelection: string[];
  allSequenceFragmentUuids: string[];
  fragmentByUuid: ReadonlyMap<string, { key: string }>;
  mutations: SequenceMutations;
};

export type SectionOps = {
  splitContext: SplitContext | undefined;
  canSplitBefore: boolean;
  canSplitAfter: boolean;
  groupSelection: () => Promise<void>;
  splitBefore: () => Promise<void>;
  splitAfter: () => Promise<void>;
  moveSelectionToSection: (sectionUuid: string) => Promise<void>;
  sectionsForMove: NamedSection[];
  mergeableUpSections: NamedSection[];
  mergeableDownSections: NamedSection[];
  mergeSectionUp: (sectionUuid: string) => Promise<void>;
  mergeSectionDown: (sectionUuid: string) => Promise<void>;
  unplaceFragment: (fragmentUuid: string) => Promise<void>;
  placedFragmentsForUnplace: { uuid: string; key: string }[];
};

/**
 * The Overview's section-operations cluster, lifted out of the page so it is testable through
 * its own interface. Orchestrates group / split / move / merge / unplace over the
 * `useSequenceMutations` handle, deriving the eligible-section and split guards from the passed-in
 * `sectionsData` / `placedSelection` rather than reaching back into the page's query state.
 */
export const useSectionOps = ({
  projectId,
  sequence,
  sectionsData,
  placedSelection,
  allSequenceFragmentUuids,
  fragmentByUuid,
  mutations,
}: Args): SectionOps => {
  // Split operates on a single placed fragment. The backend op splits *before* the given
  // fragment; "split after X" is the same op applied to the next fragment in X's section.
  const splitContext = useMemo<SplitContext | undefined>(() => {
    if (placedSelection.length !== 1) return undefined;
    const fragmentUuid = placedSelection[0]!;
    const section = sectionsData.find((s) => s.fragmentUuids.includes(fragmentUuid));
    if (!section) return undefined;
    const index = section.fragmentUuids.indexOf(fragmentUuid);
    return {
      fragmentUuid,
      nextFragmentUuid: section.fragmentUuids[index + 1],
      isFirst: index === 0,
      isLast: index === section.fragmentUuids.length - 1,
    };
  }, [placedSelection, sectionsData]);

  const canSplitBefore = !!splitContext && !splitContext.isFirst;
  const canSplitAfter = !!splitContext && !splitContext.isLast;

  const groupSelection = useCallback(async () => {
    if (!sequence || placedSelection.length < 1) return;
    await mutations.groupFragments.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuids: placedSelection, name: "" },
    });
  }, [sequence, placedSelection, projectId, mutations]);

  const splitBefore = useCallback(async () => {
    if (!sequence || !splitContext || splitContext.isFirst) return;
    await mutations.splitSection.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuid: splitContext.fragmentUuid, name: "" },
    });
  }, [sequence, splitContext, projectId, mutations]);

  const splitAfter = useCallback(async () => {
    if (!sequence || !splitContext || splitContext.isLast || !splitContext.nextFragmentUuid) return;
    await mutations.splitSection.mutateAsync({
      projectId,
      sequenceId: sequence.uuid,
      data: { fragmentUuid: splitContext.nextFragmentUuid, name: "" },
    });
  }, [sequence, splitContext, projectId, mutations]);

  const moveSelectionToSection = useCallback(
    async (sectionUuid: string) => {
      if (!sequence || placedSelection.length < 1) return;
      const targetSection = sectionsData.find((s) => s.uuid === sectionUuid);
      const position = targetSection?.fragmentUuids.length ?? 0;
      await mutations.moveFragments.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        data: { fragmentUuids: placedSelection, sectionUuid, position },
      });
    },
    [sequence, placedSelection, sectionsData, projectId, mutations],
  );

  const sectionsForMove = useMemo<NamedSection[]>(
    () => sectionsData.map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );

  // Merge dissolves a section boundary by fusing a section with the one below it (the backend op).
  // "Merge up" applies it to the previous section; "down" to this one. A section can merge up if
  // it has a predecessor, down if a successor.
  const mergeableUpSections = useMemo<NamedSection[]>(
    () => sectionsData.slice(1).map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );
  const mergeableDownSections = useMemo<NamedSection[]>(
    () => sectionsData.slice(0, -1).map((section) => ({ uuid: section.uuid, name: section.name })),
    [sectionsData],
  );

  const mergeSectionUp = useCallback(
    async (sectionUuid: string) => {
      if (!sequence) return;
      const index = sectionsData.findIndex((s) => s.uuid === sectionUuid);
      if (index <= 0) return;
      await mutations.mergeSection.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        sectionId: sectionsData[index - 1]!.uuid,
      });
    },
    [sequence, sectionsData, projectId, mutations],
  );

  const mergeSectionDown = useCallback(
    async (sectionUuid: string) => {
      if (!sequence) return;
      const index = sectionsData.findIndex((s) => s.uuid === sectionUuid);
      if (index === -1 || index >= sectionsData.length - 1) return;
      await mutations.mergeSection.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        sectionId: sectionUuid,
      });
    },
    [sequence, sectionsData, projectId, mutations],
  );

  // Unplace a single fragment from the active sequence, returning it to the pool. Shares the
  // optimistic mutation used by drag-to-pool; surfaced as a direct button on each placed fragment.
  const unplaceFragment = useCallback(
    async (fragmentUuid: string) => {
      if (!sequence) return;
      await mutations.unplaceFragment.mutateAsync({
        projectId,
        sequenceId: sequence.uuid,
        fragmentUuid,
      });
    },
    [sequence, projectId, mutations],
  );

  const placedFragmentsForUnplace = useMemo(
    () =>
      allSequenceFragmentUuids.map((uuid) => ({
        uuid,
        key: fragmentByUuid.get(uuid)?.key ?? uuid,
      })),
    [allSequenceFragmentUuids, fragmentByUuid],
  );

  return {
    splitContext,
    canSplitBefore,
    canSplitAfter,
    groupSelection,
    splitBefore,
    splitAfter,
    moveSelectionToSection,
    sectionsForMove,
    mergeableUpSections,
    mergeableDownSections,
    mergeSectionUp,
    mergeSectionDown,
    unplaceFragment,
    placedFragmentsForUnplace,
  };
};
