const FENCED_CODE_REGEX = /```[\s\S]*?```/g;
const INLINE_CODE_REGEX = /`[^`]+`/g;
const LINK_URL_REGEX = /\[([^\]]*)\]\([^)]*\)/g;

export const computeWordCount = (content: string): number => {
  const stripped = content
    .replace(FENCED_CODE_REGEX, "")
    .replace(INLINE_CODE_REGEX, "")
    .replace(LINK_URL_REGEX, "$1");
  const trimmed = stripped.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
};
