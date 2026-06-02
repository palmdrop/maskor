import type { Reference } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";
import { deriveCategory } from "../../../utils/category";

// `uuid` is the only frontmatter key Maskor manages on a reference (category is derived from the
// path, content is the body); every other key is user-authored and carried through verbatim.
const MANAGED_FRONTMATTER_KEYS = new Set(["uuid"]);

const extractExtraFrontmatter = (frontmatter: Record<string, unknown>): Record<string, unknown> => {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) extra[key] = value;
  }
  return extra;
};

export const fromFile = (parsed: ParsedFile, filePath: string): Reference => {
  const frontmatter = parsed.frontmatter;
  const key = basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as string,
    key,
    category: deriveCategory(filePath),
    content: parsed.body,
    extraFrontmatter: extractExtraFrontmatter(frontmatter),
  };
};

export const toFile = (
  reference: Reference,
): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    // Unmanaged user keys first, so the managed keys below always win on a name clash.
    ...(reference.extraFrontmatter ?? {}),
    uuid: reference.uuid,
  },
  body: reference.content,
});
