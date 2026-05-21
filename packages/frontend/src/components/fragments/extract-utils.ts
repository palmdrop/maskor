const ENTITY_KEY_REGEX = /^[\p{L}\p{N} _-]+$/u;

export const findSmallestUnusedSuffix = (keys: Set<string>, prefix = "unnamed-fragment"): number => {
  let n = 1;
  while (keys.has(`${prefix}-${n}`)) n++;
  return n;
};

export const validateExtractKey = (
  key: string,
  allKeys: Set<string>,
  discardedKeys: Set<string>,
  entityType: "fragment" | "note" | "reference" | "aspect" = "fragment",
): string | null => {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "Key is required";
  if (!ENTITY_KEY_REGEX.test(trimmed))
    return "Key may only contain letters, numbers, spaces, hyphens, and underscores";
  if (discardedKeys.has(trimmed))
    return "A discarded fragment uses this key. Restore or rename it first.";
  const article = entityType === "aspect" ? "An" : "A";
  if (allKeys.has(trimmed)) return `${article} ${entityType} with this key already exists`;
  return null;
};
