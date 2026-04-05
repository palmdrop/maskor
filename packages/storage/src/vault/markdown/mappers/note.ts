import type { Note, NoteUUID } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

export const fromFile = (parsed: ParsedFile, filePath: string): Note => {
  const frontmatter = parsed.frontmatter;

  const title =
    typeof frontmatter.title === "string" && frontmatter.title.trim() !== ""
      ? frontmatter.title.trim()
      : basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as NoteUUID,
    title,
    content: parsed.body,
  };
};

export const toFile = (note: Note): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    uuid: note.uuid,
    title: note.title,
  },
  body: note.content,
});
