import { useQueryClient } from "@tanstack/react-query";
import {
  usePlaceFragment,
  useMoveFragment,
  useUnplaceFragment,
  type ListSequencesResponse,
} from "@api/generated/sequences/sequences";
import { optimisticPlace, optimisticMove, optimisticUnplace } from "./optimisticUpdates";

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

  return { placeFragment, moveFragment, unplaceFragment };
};
