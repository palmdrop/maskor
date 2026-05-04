import type { Note } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

export const fromFile = (parsed: ParsedFile, filePath: string): Note => {
  const frontmatter = parsed.frontmatter;
  const key = basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as string,
    key,
    content: parsed.body,
  };
};

export const toFile = (note: Note): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    uuid: note.uuid,
  },
  body: note.content,
});
