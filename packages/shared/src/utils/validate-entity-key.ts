export const ENTITY_KEY_REGEX = /^[a-zA-Z0-9 _-]+$/;

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
