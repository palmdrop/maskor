import type { Reference } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

export const fromFile = (parsed: ParsedFile, filePath: string): Reference => {
  const frontmatter = parsed.frontmatter;

  const name =
    typeof frontmatter.name === "string" && frontmatter.name.trim() !== ""
      ? frontmatter.name.trim()
      : basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as string,
    name,
    content: parsed.body,
  };
};

export const toFile = (
  reference: Reference,
): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    uuid: reference.uuid,
    name: reference.name,
  },
  body: reference.content,
});
