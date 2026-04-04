/**
 * Converts a title or key string to a filename-safe slug.
 * Example: "The Bridge" → "the-bridge"
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
