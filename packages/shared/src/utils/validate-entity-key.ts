const ENTITY_KEY_CHAR_CLASS = "\\p{L}\\p{N} _-";

export const ENTITY_KEY_REGEX = new RegExp(`^[${ENTITY_KEY_CHAR_CLASS}]+$`, "u");

const ENTITY_KEY_STRIP_REGEX = new RegExp(`[^${ENTITY_KEY_CHAR_CLASS}]`, "gu");

export const validateEntityKey = (key: string): string => {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new Error("Key must not be empty");
  }
  if (!ENTITY_KEY_REGEX.test(trimmed)) {
    throw new Error("Key may only contain letters, numbers, spaces, hyphens, and underscores");
  }
  return trimmed;
};

export const sanitizeEntityKey = (candidate: string): string =>
  candidate.replace(ENTITY_KEY_STRIP_REGEX, "").replace(/\s+/g, " ").trim();
