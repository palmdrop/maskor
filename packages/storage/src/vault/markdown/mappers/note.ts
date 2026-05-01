import type { Note } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

export const fromFile = (parsed: ParsedFile, filePath: string): Note => {
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

export const toFile = (note: Note): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    uuid: note.uuid,
    key: note.key,
  },
  body: note.content,
});
