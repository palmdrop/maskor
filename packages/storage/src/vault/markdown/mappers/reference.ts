import type { Reference } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

export const fromFile = (parsed: ParsedFile, filePath: string): Reference => {
  const frontmatter = parsed.frontmatter;

  const key =
    typeof frontmatter.key === "string" && frontmatter.key.trim() !== ""
      ? frontmatter.key.trim()
      : basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as string,
    key,
    content: parsed.body,
  };
};

export const toFile = (
  reference: Reference,
): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    uuid: reference.uuid,
    key: reference.key,
  },
  body: reference.content,
});
