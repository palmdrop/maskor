export const SWAP_DIRNAME = ".maskor";
export const SWAP_SUBDIR = "swap";

// "margin" is keyed by the owning fragment's UUID — the fragment and its Margin form a linked swap
// pair (see specifications/margins.md), so the Margin's unsaved buffer is mirrored alongside the
// fragment's and the two restore together.
export const SWAP_ENTITY_TYPES = ["fragment", "aspect", "note", "reference", "margin"] as const;

export type SwapEntityType = (typeof SWAP_ENTITY_TYPES)[number];
