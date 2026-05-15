import mammoth from "mammoth";
import TurndownService from "turndown";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { PhrasingContent, RootContent } from "mdast";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Piece = {
  title?: string;
  content: string;
};

function extractText(node: PhrasingContent | RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return (node.children as (PhrasingContent | RootContent)[])
      .map(extractText)
      .join("");
  }
  return "";
}

export function splitMarkdown(
  content: string,
  maxHeadingLevel: HeadingLevel,
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
    const newlineIdx = content.indexOf("\n", startOffset);
    prevEnd = newlineIdx >= 0 ? newlineIdx + 1 : content.length;
    prevTitle = title;
  }

  const last = content.slice(prevEnd).trim();
  if (last) {
    pieces.push({ title: prevTitle, content: last });
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
