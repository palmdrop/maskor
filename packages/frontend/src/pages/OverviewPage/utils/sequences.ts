import { arrayMove } from "@dnd-kit/sortable";
import type { Sequence } from "../../../api/generated/maskorAPI.schemas";

export function optimisticPlace(
  sequence: Sequence,
  fragmentUuid: string,
  position: number,
): Sequence {
  const section = sequence.sections[0];
  if (!section) return sequence;
  const sorted = [...section.fragments].sort((a, b) => a.position - b.position);
  sorted.splice(position, 0, { uuid: crypto.randomUUID(), fragmentUuid, position });
  const recompacted = sorted.map((fragment, index) => ({ ...fragment, position: index }));
  return { ...sequence, sections: [{ ...section, fragments: recompacted }] };
}

export function optimisticMove(
  sequence: Sequence,
  fragmentUuid: string,
  newPosition: number,
): Sequence {
  const section = sequence.sections[0];
  if (!section) return sequence;
  const sorted = [...section.fragments].sort((a, b) => a.position - b.position);
  const oldIndex = sorted.findIndex((fragment) => fragment.fragmentUuid === fragmentUuid);
  if (oldIndex === -1) return sequence;
  const reordered = arrayMove(sorted, oldIndex, newPosition);
  const recompacted = reordered.map((fragment, index) => ({ ...fragment, position: index }));
  return { ...sequence, sections: [{ ...section, fragments: recompacted }] };
}

export function optimisticUnplace(sequence: Sequence, fragmentUuid: string): Sequence {
  const section = sequence.sections[0];
  if (!section) return sequence;
  const without = section.fragments.filter((fragment) => fragment.fragmentUuid !== fragmentUuid);
  const recompacted = [...without]
    .sort((a, b) => a.position - b.position)
    .map((fragment, index) => ({ ...fragment, position: index }));
  return { ...sequence, sections: [{ ...section, fragments: recompacted }] };
}
