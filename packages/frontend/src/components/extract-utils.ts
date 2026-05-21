// TODO: ENTITY_KEY_REGEX duplicates @maskor/shared/utils/validate-entity-key. The barrel re-exports a
// pino-based logger that references `process.stdout`, so any value import from @maskor/shared crashes
// in the browser. See SUGGESTIONS.md ("@maskor/shared barrel exports a Node-only logger").
const ENTITY_KEY_REGEX = /^[\p{L}\p{N} _-]+$/u;

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
