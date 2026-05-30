import matter from "gray-matter";
import { ENTITY_KEY_CHAR_CLASS } from "@maskor/shared";

export type ParsedFile = {
  frontmatter: Record<string, unknown>;
  inlineFields: Record<string, string>;
  body: string;
};

export const INLINE_FIELD_REGEX = new RegExp(`^([${ENTITY_KEY_CHAR_CLASS}]+):: (.+)$`, "u");

export const parseFile = (rawFile: string): ParsedFile => {
  const parsed = matter(rawFile);
  // gray-matter caches by input string and returns the SAME `.data` object for byte-identical
  // content. Callers mutate frontmatter in place (adoption mints `uuid`; future edits could push
  // into nested `notes`/`references` arrays), so a shared object would let one file's mutation leak
  // into another identical-content file's parse (silent UUID collapse on adopt, or worse for nested
  // values). Deep-clone — a shallow copy would still share the nested arrays/objects. Frontmatter is
  // YAML-derived plain data (strings, numbers, arrays, objects, dates), all structuredClone-safe.
  const frontmatter = structuredClone(parsed.data) as Record<string, unknown>;

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
