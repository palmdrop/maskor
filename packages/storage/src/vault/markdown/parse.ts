import matter from "gray-matter";
import { ENTITY_KEY_CHAR_CLASS } from "@maskor/shared";
import { VaultError } from "../types";

export type ParsedFile = {
  frontmatter: Record<string, unknown>;
  inlineFields: Record<string, string>;
  body: string;
};

export const INLINE_FIELD_REGEX = new RegExp(`^([${ENTITY_KEY_CHAR_CLASS}]+):: (.+)$`, "u");

export const parseFile = (rawFile: string): ParsedFile => {
  // Pass an options object so gray-matter does NOT use its module-level, input-string-keyed cache.
  // The cache is doubly dangerous: it returns the SAME `.data` object for byte-identical content
  // (and callers mutate frontmatter in place — adoption mints `uuid`), AND once a parse throws on
  // malformed YAML it caches an empty `{}` for that string, so the next identical call returns `{}`
  // instead of throwing — silently turning a malformed file into an empty entity on a later read.
  // Bypassing the cache keeps malformed files reliably throwing so the rebuild can report them.
  const parsed = matter(rawFile, {});
  // Deep-clone as belt-and-suspenders so callers can mutate frontmatter in place. Frontmatter is
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

// Parse an entity file, converting a parse failure (malformed YAML frontmatter, etc.) into a
// typed VaultError the watcher recognises and surfaces as an INVALID_ENTITY_FILE warning, instead
// of a generic "unhandled error" log. The bulk rebuild reader catches the raw parseFile error
// itself, so it uses parseFile directly; this wrapper is for the per-file watcher sync path.
export const parseEntityFileOrThrow = (rawFile: string, entityRelativePath: string): ParsedFile => {
  try {
    return parseFile(rawFile);
  } catch (cause) {
    throw new VaultError(
      "INVALID_ENTITY_FILE",
      `Failed to parse entity file: "${entityRelativePath}"`,
      {
        filePath: entityRelativePath,
        reason: cause instanceof Error ? cause.message : String(cause),
      },
      { cause },
    );
  }
};
