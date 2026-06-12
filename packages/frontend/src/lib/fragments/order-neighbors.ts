// Previous/Next traversal over a view-supplied fragment ordering. The fragment
// editor's navigation is a slot the mounting view fills (see fragment-editor.md);
// every view that drives Previous/Next does the same index arithmetic over its own
// ordered uuids — the fragment list's filtered order, the Overview spine order, the
// Preview assembled order. This is that arithmetic, in one place.

export interface OrderNeighbors {
  previousUuid: string | null;
  nextUuid: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
}

// Neighbours of `uuid` within `order`. If `uuid` is absent from `order` (filtered
// out of the list, unplaced, discarded, or simply null) both directions clamp to
// disabled — there is no fragment to step from.
export const orderNeighbors = (order: readonly string[], uuid: string | null): OrderNeighbors => {
  const index = uuid ? order.indexOf(uuid) : -1;
  const previousUuid = index > 0 ? order[index - 1]! : null;
  const nextUuid = index >= 0 && index < order.length - 1 ? order[index + 1]! : null;
  return {
    previousUuid,
    nextUuid,
    hasPrevious: previousUuid !== null,
    hasNext: nextUuid !== null,
  };
};

// The Overview overlay's edit order: placed fragments in spine order with discarded
// ones removed. The unassigned pool is already excluded upstream (the caller passes
// the placed uuids); discarded fragments are still placed, so they are filtered here.
export const overviewEditOrder = (
  placedFragmentUuids: readonly string[],
  fragmentByUuid: ReadonlyMap<string, { isDiscarded?: boolean }>,
): string[] => placedFragmentUuids.filter((uuid) => !fragmentByUuid.get(uuid)?.isDiscarded);
