import mammoth from "mammoth";
import TurndownService from "turndown";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { PhrasingContent, RootContent } from "mdast";
import { sanitizeEntityKey, stripCommentMarkers } from "@maskor/shared";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Piece = {
  title?: string;
  content: string;
};

export type RawPiece = {
  headingText?: string;
  content: string;
};

// A key is derived from human text — a heading or the first line of prose. Keep
// only the first few words so a whole paragraph never becomes the key, and strip
// anchor markers (`<!--c:ID-->`) first so a marker on the line never leaks into
// the key. Returns null when nothing usable remains.
const MAX_KEY_WORDS = 8;

const toKeyCandidate = (raw: string): string | null => {
  const sanitized = sanitizeEntityKey(stripCommentMarkers(raw));
  if (!sanitized) return null;
  return sanitized.split(/\s+/).slice(0, MAX_KEY_WORDS).join(" ");
};

export function deriveKey(piece: RawPiece, existingKeys: Set<string>): string {
  const candidates: string[] = [];

  if (piece.headingText) {
    const candidate = toKeyCandidate(piece.headingText);
    if (candidate) candidates.push(candidate);
  }

  const firstNonEmptyLine = piece.content.split("\n").find((line) => line.trim().length > 0);
  if (firstNonEmptyLine) {
    const candidate = toKeyCandidate(firstNonEmptyLine);
    if (candidate) candidates.push(candidate);
  }

  const baseKey: string =
    candidates.length > 0 ? (candidates[0] as string) : `fragment-${crypto.randomUUID()}`;

  let key = baseKey;
  let counter = 1;
  while (existingKeys.has(key.toLowerCase())) {
    key = `${baseKey}_${counter}`;
    counter++;
  }

  existingKeys.add(key.toLowerCase());
  return key;
}

function extractText(node: PhrasingContent | RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return (node.children as (PhrasingContent | RootContent)[]).map(extractText).join("");
  }
  return "";
}

// A structural delimiter the splitter cuts on. Shared by the import pipeline and
// the fragment splitter so both draw from one delimiter set. The user picks a
// *type*; the splitter cuts at every existing occurrence of it in the content.
export type SplitDelimiter =
  | { type: "heading"; level: HeadingLevel }
  | { type: "thematic-break" }
  | { type: "blank-line" };

// Options shared across delimiter modes.
export type SplitOptions = {
  // When true, the heading line that starts a piece is kept in that piece's
  // content (the fragment splitter — no prose may be lost across a split). When
  // false (the default, used by the import path), the heading line is consumed
  // into the piece's `title` and dropped from the body, since import lifts the
  // title into the new entity's frontmatter. Only affects heading-mode.
  retainHeadingInContent?: boolean;
};

// Single call site expressing every delimiter mode. `deriveKey` title derivation
// keeps working for each: heading pieces carry the heading text as `title`;
// thematic-break and blank-line pieces have no title and fall back to the first
// non-empty line.
export function splitByDelimiter(
  content: string,
  delimiter: SplitDelimiter,
  options: SplitOptions = {},
): Piece[] {
  switch (delimiter.type) {
    case "heading":
      return splitMarkdown(content, delimiter.level, options);
    case "thematic-break":
      return splitThematicBreak(content);
    case "blank-line":
      return splitBlankLine(content);
  }
}

export function splitMarkdown(
  content: string,
  maxHeadingLevel: HeadingLevel,
  options: SplitOptions = {},
): Piece[] {
  const tree = fromMarkdown(content);
  const pieces: Piece[] = [];

  const splitPoints: Array<{ title: string; startOffset: number }> = [];

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth <= maxHeadingLevel) {
      const startOffset = node.position?.start.offset ?? 0;
      const title = node.children.map(extractText).join("");
      splitPoints.push({ title, startOffset });
    }
  }

  let prevEnd = 0;
  let prevTitle: string | undefined = undefined;

  for (const { title, startOffset } of splitPoints) {
    const before = content.slice(prevEnd, startOffset).trim();
    if (before) {
      pieces.push({ title: prevTitle, content: before });
    }

    if (options.retainHeadingInContent) {
      // Keep the heading line in the piece it introduces — the body must survive
      // the split intact, and the heading still derives the piece's key via `title`.
      prevEnd = startOffset;
    } else {
      // Consume the heading line into the title and drop it from the body.
      const newlineIndex = content.indexOf("\n", startOffset);
      prevEnd = newlineIndex >= 0 ? newlineIndex + 1 : content.length;
    }

    prevTitle = title;
  }

  const last = content.slice(prevEnd).trim();
  if (last) {
    pieces.push({ title: prevTitle, content: last });
  }

  return pieces;
}

// Cut at each markdown thematic break (`---`/`***`/`___`). We traverse the mdast
// tree rather than splitting the raw string so a `---` inside a fenced code block
// (a `code` node) or a setext underline (which makes the line above a `heading`)
// is never mistaken for a break. The break node itself is dropped from both
// pieces. Thematic-break pieces carry no title; `deriveKey` falls back to the
// first non-empty line.
export function splitThematicBreak(content: string): Piece[] {
  const tree = fromMarkdown(content);
  const breaks = tree.children.filter((node) => node.type === "thematicBreak");

  if (breaks.length === 0) {
    const trimmed = content.trim();
    return trimmed ? [{ content: trimmed }] : [];
  }

  const pieces: Piece[] = [];
  let prevEnd = 0;

  for (const node of breaks) {
    const startOffset = node.position?.start.offset ?? 0;
    const endOffset = node.position?.end.offset ?? startOffset;
    const before = content.slice(prevEnd, startOffset).trim();
    if (before) {
      pieces.push({ content: before });
    }
    prevEnd = endOffset;
  }

  const last = content.slice(prevEnd).trim();
  if (last) {
    pieces.push({ content: last });
  }

  return pieces;
}

// Cut at each blank-line boundary between top-level blocks. Adjacent top-level
// nodes separated only by a single newline (e.g. a heading directly above its
// paragraph) stay in one piece; a blank line between them is a cut. Traversing
// the mdast tree means blank lines *inside* a fenced code block live within one
// `code` node and never cut. Blank-line pieces carry no title; `deriveKey` falls
// back to the first non-empty line.
export function splitBlankLine(content: string): Piece[] {
  const tree = fromMarkdown(content);
  const blocks = tree.children;

  if (blocks.length === 0) {
    return [];
  }

  const pieces: Piece[] = [];
  let segmentStart = blocks[0]!.position?.start.offset ?? 0;
  let segmentEnd = blocks[0]!.position?.end.offset ?? segmentStart;

  for (let index = 1; index < blocks.length; index++) {
    const block = blocks[index]!;
    const blockStart = block.position?.start.offset ?? 0;
    const blockEnd = block.position?.end.offset ?? blockStart;

    const gap = content.slice(segmentEnd, blockStart);
    const newlineCount = (gap.match(/\n/g) ?? []).length;
    if (newlineCount >= 2) {
      const piece = content.slice(segmentStart, segmentEnd).trim();
      if (piece) {
        pieces.push({ content: piece });
      }
      segmentStart = blockStart;
    }
    segmentEnd = blockEnd;
  }

  const last = content.slice(segmentStart, segmentEnd).trim();
  if (last) {
    pieces.push({ content: last });
  }

  return pieces;
}

export interface DocumentConverter {
  toMarkdown(input: Uint8Array): Promise<string>;
}

export class MammothConverter implements DocumentConverter {
  async toMarkdown(input: Uint8Array): Promise<string> {
    const buffer = Buffer.from(input);
    const result = await mammoth.convertToHtml({ buffer });
    const td = new TurndownService({ headingStyle: "atx" });
    td.addRule("stripImages", {
      filter: "img",
      replacement: () => "",
    });
    return td.turndown(result.value);
  }
}

export function splitPlainText(content: string, delimiter: string): Piece[] {
  if (!delimiter) {
    return content.trim() ? [{ content }] : [];
  }

  return content
    .split(delimiter)
    .filter((piece) => piece.trim().length > 0)
    .map((piece) => ({ content: piece }));
}
