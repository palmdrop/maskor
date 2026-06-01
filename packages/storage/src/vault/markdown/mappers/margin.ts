import type { Comment, Margin } from "@maskor/shared";
import { buildCommentMarker } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";

// Section headings the Margin body is split on. The notes section is free prose; the comments
// section is a sequence of comment blocks. Both headings are always written so the structure is
// stable and Obsidian-legible even when a section is empty.
const NOTES_HEADING = "## Notes";
const COMMENTS_HEADING = "## Comments";

const MARKER_LINE_REGEX = /^<!--c:([A-Za-z0-9_-]+)-->\s*$/;

const parseDate = (raw: unknown): Date =>
  typeof raw === "string" && raw ? new Date(raw) : new Date();

// Parse the comments section into individual comments. A comment opens with its marker line
// (`<!--c:ID-->`); the contiguous run of blockquote (`>`) lines immediately after is the stored
// excerpt; the remainder up to the next marker is the free-prose body. Text before the first
// marker line is preamble and ignored.
const parseComments = (section: string): Comment[] => {
  const lines = section.split("\n");
  const comments: Comment[] = [];

  let markerId: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (markerId === null) return;
    let index = 0;
    const excerptLines: string[] = [];
    while (index < buffer.length && buffer[index]?.startsWith(">")) {
      excerptLines.push(buffer[index]!.replace(/^>\s?/, ""));
      index++;
    }
    while (index < buffer.length && buffer[index]?.trim() === "") index++;
    comments.push({
      markerId,
      excerpt: excerptLines.join("\n").trim(),
      body: buffer.slice(index).join("\n").trim(),
    });
  };

  for (const line of lines) {
    const match = MARKER_LINE_REGEX.exec(line);
    if (match?.[1]) {
      flush();
      markerId = match[1];
      buffer = [];
      continue;
    }
    if (markerId !== null) buffer.push(line);
  }
  flush();

  return comments;
};

// Split the Margin body into its notes prose and comments. Tolerant of a body missing either
// heading: text before `## Comments` (or before `## Notes`) is treated as notes.
const parseMarginBody = (body: string): { notes: string; comments: Comment[] } => {
  const commentsIndex = body.search(/^## Comments\s*$/m);
  const beforeComments = commentsIndex === -1 ? body : body.slice(0, commentsIndex);
  const commentsSection = commentsIndex === -1 ? "" : body.slice(commentsIndex);

  const notes = beforeComments.replace(/^## Notes\s*$/m, "").trim();
  const comments = parseComments(commentsSection.replace(/^## Comments\s*$/m, ""));

  return { notes, comments };
};

const serializeComment = (comment: Comment): string => {
  const parts = [buildCommentMarker(comment.markerId)];
  if (comment.excerpt.trim()) {
    parts.push(
      comment.excerpt
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    );
  }
  if (comment.body.trim()) parts.push(comment.body.trim());
  return parts.join("\n");
};

// Serialize notes + comments back into a Margin body. Both headings are always emitted so the
// fixed structure survives a round-trip even when sections are empty.
export const serializeMarginBody = (notes: string, comments: Comment[]): string => {
  const segments: string[] = [NOTES_HEADING];
  if (notes.trim()) segments.push(notes.trim());
  segments.push(COMMENTS_HEADING);
  const commentsBlock = comments.map(serializeComment).join("\n\n");
  if (commentsBlock) segments.push(commentsBlock);
  return segments.join("\n\n");
};

export const fromFile = (parsed: ParsedFile, filePath: string): Margin => {
  const frontmatter = parsed.frontmatter;
  const fragmentKey = basename(filePath).replace(/\.md$/, "");
  const { notes, comments } = parseMarginBody(parsed.body);

  return {
    fragmentUuid: frontmatter.fragmentUuid as string,
    fragmentKey,
    notes,
    comments,
    createdAt: parseDate(frontmatter.createdAt),
    updatedAt: parseDate(frontmatter.updatedAt),
  };
};

export const toFile = (margin: Margin): { frontmatter: Record<string, unknown>; body: string } => ({
  frontmatter: {
    fragmentUuid: margin.fragmentUuid,
    createdAt: margin.createdAt.toISOString(),
    updatedAt: margin.updatedAt.toISOString(),
  },
  body: serializeMarginBody(margin.notes, margin.comments),
});
