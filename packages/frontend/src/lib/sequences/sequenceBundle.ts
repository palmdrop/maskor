import type { Sequence } from "@api/generated/maskorAPI.schemas";
import type { ListSequencesResponse } from "@api/generated/sequences/sequences";

/**
 * Lens over the list-sequences cache bundle: narrows the success envelope, finds the
 * target sequence, applies `update`, and writes it back immutably. Returns the bundle
 * unchanged on a non-200 envelope or a missing sequence — so every optimistic reducer
 * stays a pure `Sequence → Sequence` function with no knowledge of the cache shape.
 */
export const updateSequenceInBundle = (
  bundle: ListSequencesResponse | undefined,
  sequenceId: string,
  update: (sequence: Sequence) => Sequence,
): ListSequencesResponse | undefined => {
  if (!bundle || bundle.status !== 200) return bundle;
  const currentSequence = bundle.data.sequences.find((sequence) => sequence.uuid === sequenceId);
  if (!currentSequence) return bundle;
  const updated = update(currentSequence);
  return {
    ...bundle,
    data: {
      ...bundle.data,
      sequences: bundle.data.sequences.map((sequence) =>
        sequence.uuid === sequenceId ? updated : sequence,
      ),
    },
  };
};
