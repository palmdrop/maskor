import { ENTITY_KEY_REGEX } from "@maskor/shared";

type EntityType = "fragment" | "note" | "reference" | "aspect";

export const findSmallestUnusedSuffix = (
  keys: Set<string>,
  prefix = "unnamed-fragment",
): number => {
  let n = 1;
  while (keys.has(`${prefix}-${n}`)) n++;
  return n;
};

export const validateExtractKey = (
  key: string,
  allKeys: Set<string>,
  entityType: EntityType,
): string | null => {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "Key is required";
  if (!ENTITY_KEY_REGEX.test(trimmed)) {
    return "Key may only contain letters, numbers, spaces, hyphens, and underscores";
  }
  const article = entityType === "aspect" ? "An" : "A";
  if (allKeys.has(trimmed)) return `${article} ${entityType} with this key already exists`;
  return null;
};
