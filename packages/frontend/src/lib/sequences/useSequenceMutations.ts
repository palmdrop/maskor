import { useQueryClient } from "@tanstack/react-query";
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

export const useSequenceMutations = (listQueryKey: readonly unknown[]) => {
  const queryClient = useQueryClient();

  const placeFragment = usePlaceFragment({
    mutation: {
      onMutate: async ({ sequenceId, data: { fragmentUuid, sectionUuid, position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticPlace(currentSequence, fragmentUuid, sectionUuid, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const moveFragment = useMoveFragment({
    mutation: {
      onMutate: async ({ sequenceId, fragmentUuid, data: { sectionUuid, position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticMove(currentSequence, fragmentUuid, sectionUuid, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const unplaceFragment = useUnplaceFragment({
    mutation: {
      onMutate: async ({ sequenceId, fragmentUuid }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticUnplace(currentSequence, fragmentUuid);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const moveSection = useReorderSection({
    mutation: {
      onMutate: async ({ sequenceId, sectionId, data: { position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticMoveSection(currentSequence, sectionId, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const groupFragments = useGroupFragments({
    mutation: {
      onMutate: async ({ sequenceId, data: { fragmentUuids, name } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticGroup(currentSequence, fragmentUuids, name);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const moveFragments = useMoveFragments({
    mutation: {
      onMutate: async ({ sequenceId, data: { fragmentUuids, sectionUuid, position } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticMoveMany(currentSequence, fragmentUuids, sectionUuid, position);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const splitSection = useSplitSection({
    mutation: {
      onMutate: async ({ sequenceId, data: { fragmentUuid, name } }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticSplit(currentSequence, fragmentUuid, name);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
  });

  const mergeSection = useMergeSection({
    mutation: {
      onMutate: async ({ sequenceId, sectionId }) => {
        await queryClient.cancelQueries({ queryKey: listQueryKey });
        const snapshot = queryClient.getQueryData<ListSequencesResponse>(listQueryKey);
        queryClient.setQueryData<ListSequencesResponse>(listQueryKey, (previous) => {
          if (!previous || previous.status !== 200) return previous;
          const currentSequence = previous.data.sequences.find((s) => s.uuid === sequenceId);
          if (!currentSequence) return previous;
          const updated = optimisticMergeWithNext(currentSequence, sectionId);
          return {
            ...previous,
            data: {
              ...previous.data,
              sequences: previous.data.sequences.map((s) => (s.uuid === sequenceId ? updated : s)),
            },
          };
        });
        return { snapshot };
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: listQueryKey });
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot) queryClient.setQueryData(listQueryKey, context.snapshot);
      },
    },
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
