import {
  usePlaceFragment,
  useMoveFragment,
  useUnplaceFragment,
  useReorderSection,
  useGroupFragments,
  useMoveFragments,
  useSplitSection,
  useMergeSection,
  type ListSequencesResponse,
} from "@api/generated/sequences/sequences";
import type {
  FragmentPositionCreate,
  FragmentPositionMove,
  FragmentsGroup,
  FragmentsMove,
  SectionReorder,
  SectionSplit,
} from "@api/generated/maskorAPI.schemas";
import { useOptimisticMutation } from "@lib/api/useOptimisticMutation";
import { updateSequenceInBundle } from "./sequenceBundle";
import {
  optimisticPlace,
  optimisticMove,
  optimisticUnplace,
  optimisticMoveSection,
  optimisticGroup,
  optimisticMoveMany,
  optimisticSplit,
  optimisticMergeWithNext,
} from "./optimisticUpdates";

// Every sequence mutation runs the same optimistic lifecycle against the list-sequences
// cache: snapshot, apply a pure reducer to the target sequence, roll back on failure,
// invalidate on success. `useOptimisticMutation` owns that dance; each call here only
// supplies the reducer (via `updateSequenceInBundle`, which narrows the envelope and
// locates the sequence). No `reconcile` — sequence ops invalidate to refetch.
export const useSequenceMutations = (listQueryKey: readonly unknown[]) => {
  const placeFragment = usePlaceFragment({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; data: FragmentPositionCreate }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticPlace(sequence, data.fragmentUuid, data.sectionUuid, data.position),
        ),
    }),
  });

  const moveFragment = useMoveFragment({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; fragmentUuid: string; data: FragmentPositionMove }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, fragmentUuid, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticMove(sequence, fragmentUuid, data.sectionUuid, data.position),
        ),
    }),
  });

  const unplaceFragment = useUnplaceFragment({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; fragmentUuid: string }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, fragmentUuid }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticUnplace(sequence, fragmentUuid),
        ),
    }),
  });

  const moveSection = useReorderSection({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; sectionId: string; data: SectionReorder }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, sectionId, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticMoveSection(sequence, sectionId, data.position),
        ),
    }),
  });

  const groupFragments = useGroupFragments({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; data: FragmentsGroup }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticGroup(sequence, data.fragmentUuids, data.name),
        ),
    }),
  });

  const moveFragments = useMoveFragments({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; data: FragmentsMove }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticMoveMany(sequence, data.fragmentUuids, data.sectionUuid, data.position),
        ),
    }),
  });

  const splitSection = useSplitSection({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; data: SectionSplit }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, data }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticSplit(sequence, data.fragmentUuid, data.name),
        ),
    }),
  });

  const mergeSection = useMergeSection({
    mutation: useOptimisticMutation<
      ListSequencesResponse,
      { sequenceId: string; sectionId: string }
    >({
      queryKey: listQueryKey,
      apply: (previous, { sequenceId, sectionId }) =>
        updateSequenceInBundle(previous, sequenceId, (sequence) =>
          optimisticMergeWithNext(sequence, sectionId),
        ),
    }),
  });

  return {
    placeFragment,
    moveFragment,
    unplaceFragment,
    moveSection,
    groupFragments,
    moveFragments,
    splitSection,
    mergeSection,
  };
};
