export const SWAP_DIRNAME = ".maskor";
export const SWAP_SUBDIR = "swap";

export const SWAP_ENTITY_TYPES = ["fragment", "aspect", "note", "reference"] as const;

export type SwapEntityType = (typeof SWAP_ENTITY_TYPES)[number];
