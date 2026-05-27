import { ENTITY_KEY_CHAR_CLASS } from "./validate-entity-key";

// A category path is a slash-separated sequence of segments, each of which
// follows the same charset rules as an entity key. Segments cannot be empty
// (so leading/trailing slashes and doubled slashes are rejected). `..` and
// leading/trailing dots are rejected to keep paths from escaping the
// entity-type root via traversal.
const SEGMENT_REGEX = new RegExp(`^[${ENTITY_KEY_CHAR_CLASS}]+$`, "u");

export const validateCategoryPath = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
    throw new Error("Category must not start or end with a slash");
  }
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
    throw new Error("Category must not start or end with a dot");
  }

  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new Error("Category must not contain empty segments (doubled slashes)");
    }
    if (segment === "." || segment === "..") {
      throw new Error("Category must not contain `.` or `..` segments");
    }
    if (!SEGMENT_REGEX.test(segment)) {
      throw new Error(
        "Category segments may only contain letters, numbers, spaces, hyphens, and underscores",
      );
    }
  }

  return segments.join("/");
};
