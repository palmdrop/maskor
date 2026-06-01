import type { Comment, Margin } from "@maskor/shared";
import { buildCommentMarker, MARKER_ID_CHAR_CLASS } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { VaultError } from "../../types";
import { basename } from "node:path";

// Section headings the Margin body is split on. The notes section is free prose; the comments
// section is a sequence of comment blocks. Both headings are always written so the structure is
// stable and Obsidian-legible even when a section is empty.
const NOTES_HEADING = "## Notes";
const COMMENTS_HEADING = "## Comments";

// A line that is nothing but a marker. Built from the shared char-class so it can't drift from the
// rest of the marker machinery.
const MARKER_LINE_REGEX = new RegExp(`^<!--c:([${MARKER_ID_CHAR_CLASS}]+)-->\\s*$`);

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

  return dedupeComments(comments);
};

// A markerId is the comment's identity (the join to the fragment marker, and the comments-table
// composite key). An external edit could duplicate a marker block; keep the first occurrence's
// position but let the last occurrence's content win, mirroring `createComment`'s replace-by-id
// semantics. Without this a duplicated marker would collide on the `(fragmentUuid, markerId)`
// primary key during upsert.
const dedupeComments = (comments: Comment[]): Comment[] => {
  const byMarkerId = new Map<string, Comment>();
  for (const comment of comments) {
    byMarkerId.set(comment.markerId, comment);
  }
  return [...byMarkerId.values()];
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
  if (comment.body.trim()) {
    // A blank line always precedes the body so the parser can tell where the (optional) excerpt
    // ends — even when the body itself starts with a `>` blockquote, which would otherwise be
    // absorbed into the excerpt on re-parse.
    parts.push("", comment.body.trim());
  }
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

  // `fragmentUuid` is the stable join to the owning fragment and the Margin's DB primary key. Unlike
  // keyed entities, Margins are read without UUID adoption, so a hand-created or corrupted file with
  // no usable join key must be surfaced as INVALID_ENTITY_FILE rather than indexed as a junk row
  // (which, during rebuild, would also break the single write transaction).
  const fragmentUuid = frontmatter.fragmentUuid;
  if (typeof fragmentUuid !== "string" || fragmentUuid.trim() === "") {
    throw new VaultError(
      "INVALID_ENTITY_FILE",
      `Margin file "${filePath}" is missing a valid fragmentUuid`,
      { filePath, reason: "fragmentUuid frontmatter is absent or not a string" },
    );
  }

  const { notes, comments } = parseMarginBody(parsed.body);

  return {
    fragmentUuid,
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
