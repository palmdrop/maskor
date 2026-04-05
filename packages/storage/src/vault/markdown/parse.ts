import matter from "gray-matter";

export type ParsedFile = {
  frontmatter: Record<string, unknown>;
  inlineFields: Record<string, string>;
  body: string;
};

const INLINE_FIELD_REGEX = /^([\w-]+):: (.+)$/;

export const parseFile = (rawFile: string): ParsedFile => {
  const parsed = matter(rawFile);
  const frontmatter = parsed.data as Record<string, unknown>;

  const lines = parsed.content.split("\n");
  const inlineFields: Record<string, string> = {};
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === "") continue;

    const match = INLINE_FIELD_REGEX.exec(line);
    if (match?.[1] && match?.[2]) {
      inlineFields[match[1]] = match[2].trim();
      bodyStartIndex = i + 1;
    } else {
      bodyStartIndex = i;
      break;
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n").trimStart();

  return { frontmatter, inlineFields, body };
};
