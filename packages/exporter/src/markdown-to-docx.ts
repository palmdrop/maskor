import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  FootnoteReferenceRun,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
} from "docx";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { MARKER_ID_CHAR_CLASS } from "@maskor/shared";
import type {
  Root,
  Content,
  Heading,
  Paragraph as MdastParagraph,
  Strong,
  Emphasis,
  Text,
  InlineCode,
  BlockContent,
  PhrasingContent,
  List,
  ListItem,
  Blockquote,
  Code,
  FootnoteDefinition,
  FootnoteReference,
  Html,
} from "mdast";

// Maps mdast heading depth (1-6) to docx HeadingLevel enum values.
const HEADING_LEVEL_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// Word comment author for every lowered Margin annotation. Constant by design —
// Maskor is the tool speaking, not a specific writer.
const COMMENT_AUTHOR = "Maskor";

// Matches a Margin marker as a whole inline-HTML node value (`<!--c:ID-->`).
const COMMENT_MARKER_NODE_PATTERN = new RegExp(`^<!--c:([${MARKER_ID_CHAR_CLASS}]+)-->$`);

// A Word comment collected during the walk, resolved into `ICommentOptions` when
// the Document is built.
type CollectedComment = { id: number; body: string };

// Threaded through the whole conversion so footnote ids, comment allocation, and
// the marker→body map are shared across every block.
type DocxContext = {
  // Footnote identifier (from the GFM `[^label]`) → the numeric Word footnote id.
  footnoteIdByIdentifier: Map<string, number>;
  // `markerId → comment body` side-channel from the docx-bound assembly. A marker
  // present here (and trailing a paragraph/heading) becomes a Word comment.
  commentBodies: Record<string, string>;
  collectedComments: CollectedComment[];
  allocateCommentId: () => number;
};

type RunOptions = { bold?: boolean; italic?: boolean };

// The marker ids of the trailing `<!--c:ID-->` inline-HTML nodes, in document
// order (empty when none). The walk keeps going backwards past marker nodes,
// whitespace-only text nodes, and footnote references: the docx-bound assembly
// appends reference footnotes to the same line, so a run of comment markers can
// sit just before them yet still anchor its block. Every adjacent trailing marker
// anchors the block (external vault edits or a future multi-comment UI can attach
// more than one), so all are collected — not just the last.
const trailingCommentMarkerIds = (nodes: PhrasingContent[]): string[] => {
  const markerIds: string[] = [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (node.type === "text" && (node as Text).value.trim().length === 0) continue;
    if (node.type === "footnoteReference") continue;
    if (node.type === "html") {
      const match = COMMENT_MARKER_NODE_PATTERN.exec((node as Html).value);
      if (match) {
        markerIds.push(match[1]!);
        continue;
      }
      break;
    }
    break;
  }
  // Collected back-to-front; reverse so marker `a` precedes `b` (document order).
  return markerIds.reverse();
};

// Walk a phrasing-content node tree into TextRun[]s. Footnote references lower to
// `FootnoteReferenceRun`s; Margin marker HTML nodes are dropped (they are lowered
// into comment ranges by the block walkers, not rendered as text).
const phrasingToRuns = (
  nodes: PhrasingContent[],
  context: DocxContext,
  options: RunOptions = {},
): (TextRun | FootnoteReferenceRun)[] => {
  const runs: (TextRun | FootnoteReferenceRun)[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        runs.push(
          new TextRun({
            text: (node as Text).value,
            bold: options.bold,
            italics: options.italic,
          }),
        );
        break;
      }
      case "strong": {
        runs.push(
          ...phrasingToRuns((node as Strong).children, context, { ...options, bold: true }),
        );
        break;
      }
      case "emphasis": {
        runs.push(
          ...phrasingToRuns((node as Emphasis).children, context, { ...options, italic: true }),
        );
        break;
      }
      case "inlineCode": {
        runs.push(
          new TextRun({
            text: (node as InlineCode).value,
            font: "Courier New",
            bold: options.bold,
            italics: options.italic,
          }),
        );
        break;
      }
      case "footnoteReference": {
        const identifier = (node as FootnoteReference).identifier;
        const footnoteId = context.footnoteIdByIdentifier.get(identifier);
        if (footnoteId !== undefined) runs.push(new FootnoteReferenceRun(footnoteId));
        break;
      }
      case "html": {
        const value = (node as Html).value;
        // Drop Margin markers (consumed by the comment lowering); pass any other
        // inline HTML through as literal text so nothing is silently lost.
        if (COMMENT_MARKER_NODE_PATTERN.test(value)) break;
        runs.push(new TextRun({ text: value }));
        break;
      }
      case "break": {
        runs.push(new TextRun({ break: 1 }));
        break;
      }
      default: {
        const unknown = node as { value?: string };
        if (typeof unknown.value === "string") {
          runs.push(new TextRun({ text: unknown.value }));
        }
      }
    }
  }

  return runs;
};

// Wrap a paragraph/heading/list-item's runs in Word comment ranges for every
// bound marker trailing it. Returns the runs unchanged when none of the markers
// resolve to a comment body. Inert markers (no bound body) are dropped. Multiple
// comments nest: `Start a`, `Start b`, …runs…, `End b`, `End a`, then one
// `CommentReference` run per comment — overlapping comment ranges are valid OOXML.
const withCommentRanges = (
  runs: (TextRun | FootnoteReferenceRun)[],
  markerIds: string[],
  context: DocxContext,
): (TextRun | FootnoteReferenceRun | CommentRangeStart | CommentRangeEnd)[] => {
  const commentIds: number[] = [];
  for (const markerId of markerIds) {
    const body = context.commentBodies[markerId];
    if (body === undefined) continue; // inert marker — no comment to attach
    const commentId = context.allocateCommentId();
    context.collectedComments.push({ id: commentId, body });
    commentIds.push(commentId);
  }
  if (commentIds.length === 0) return runs;
  return [
    ...commentIds.map((commentId) => new CommentRangeStart(commentId)),
    ...runs,
    ...[...commentIds].reverse().map((commentId) => new CommentRangeEnd(commentId)),
    ...commentIds.map((commentId) => new TextRun({ children: [new CommentReference(commentId)] })),
  ];
};

// Convert block-level mdast nodes to docx Paragraphs.
// `indentLeft` (twips) is threaded through for blockquote nesting.
const blockToDocx = (
  node: BlockContent | Content,
  context: DocxContext,
  indentLeft = 0,
): Paragraph[] => {
  switch (node.type) {
    case "heading": {
      const headingNode = node as Heading;
      const markerIds = trailingCommentMarkerIds(headingNode.children);
      const runs = phrasingToRuns(headingNode.children, context);
      return [
        new Paragraph({
          heading: HEADING_LEVEL_MAP[headingNode.depth] ?? HeadingLevel.HEADING_6,
          children: withCommentRanges(runs, markerIds, context),
        }),
      ];
    }

    case "paragraph": {
      const paragraphNode = node as MdastParagraph;
      const markerIds = trailingCommentMarkerIds(paragraphNode.children);
      const runs = phrasingToRuns(paragraphNode.children, context);
      return [
        new Paragraph({
          ...(indentLeft > 0 ? { indent: { left: indentLeft } } : {}),
          children: withCommentRanges(runs, markerIds, context),
        }),
      ];
    }

    case "blockquote": {
      const blockquoteNode = node as Blockquote;
      const paragraphs: Paragraph[] = [];
      for (const child of blockquoteNode.children) {
        paragraphs.push(...blockToDocx(child as BlockContent, context, indentLeft + 720));
      }
      return paragraphs;
    }

    case "code": {
      const codeNode = node as Code;
      return codeNode.value.split("\n").map(
        (line) =>
          new Paragraph({
            indent: { left: 720 },
            children: [new TextRun({ text: line, font: "Courier New" })],
          }),
      );
    }

    case "thematicBreak": {
      return [new Paragraph({ thematicBreak: true })];
    }

    case "list": {
      const listNode = node as List;
      const paragraphs: Paragraph[] = [];

      const walkListItems = (items: ListItem[], depth: number, ordered: boolean) => {
        for (const item of items) {
          const runs: (TextRun | FootnoteReferenceRun)[] = [];
          // The item's paragraph phrasing content, in order — used to detect a
          // trailing comment marker. The editor anchors a marker at `range.to` of
          // its anchored block; when that block is a list, the marker trails the
          // last list item's paragraph.
          const phrasingChildren: PhrasingContent[] = [];
          for (const child of item.children) {
            if (child.type === "paragraph") {
              const children = (child as MdastParagraph).children;
              phrasingChildren.push(...children);
              runs.push(...phrasingToRuns(children, context));
            }
          }
          const markerIds = trailingCommentMarkerIds(phrasingChildren);
          paragraphs.push(
            new Paragraph({
              bullet: ordered ? undefined : { level: depth },
              numbering: ordered ? { reference: "default-numbering", level: depth } : undefined,
              children: withCommentRanges(runs, markerIds, context),
            }),
          );
          // Recurse into nested lists embedded in list items.
          for (const child of item.children) {
            if (child.type === "list") {
              walkListItems((child as List).children, depth + 1, (child as List).ordered ?? false);
            }
          }
        }
      };

      walkListItems(listNode.children, 0, listNode.ordered ?? false);
      return paragraphs;
    }

    default: {
      const unknown = node as { value?: string };
      if (typeof unknown.value === "string") {
        return [new Paragraph({ children: [new TextRun({ text: unknown.value })] })];
      }
      return [];
    }
  }
};

export type MarkdownToDocxOptions = {
  // `{ markerId → comment body }` side-channel from the docx-bound assembly. Every
  // trailing marker present here becomes a Word comment on its paragraph/heading.
  commentBodies?: Record<string, string>;
};

/**
 * Convert an assembled markdown string to a .docx file buffer.
 * Raw structural conversion only — no styling, themes, or page layout.
 * GFM footnote references/definitions lower to real Word footnotes, and trailing
 * Margin markers (against `options.commentBodies`) lower to Word comments.
 * Unknown nodes fall back to plain text; nothing throws.
 */
export const markdownToDocx = async (
  markdown: string,
  options: MarkdownToDocxOptions = {},
): Promise<Uint8Array> => {
  const tree = fromMarkdown(markdown, {
    extensions: [gfmFootnote()],
    mdastExtensions: [gfmFootnoteFromMarkdown()],
  }) as Root;

  let nextCommentId = 1;
  const context: DocxContext = {
    footnoteIdByIdentifier: new Map(),
    commentBodies: options.commentBodies ?? {},
    collectedComments: [],
    allocateCommentId: () => {
      const id = nextCommentId;
      nextCommentId += 1;
      return id;
    },
  };

  // Assign a numeric Word footnote id per distinct footnote identifier, in
  // first-definition order. Word footnote ids start at 1 (0 and -1 are reserved
  // by the docx library for the separators).
  let nextFootnoteId = 1;
  for (const node of tree.children) {
    if (node.type === "footnoteDefinition") {
      const identifier = (node as FootnoteDefinition).identifier;
      if (!context.footnoteIdByIdentifier.has(identifier)) {
        context.footnoteIdByIdentifier.set(identifier, nextFootnoteId);
        nextFootnoteId += 1;
      }
    }
  }

  // Build the footnote definition paragraphs and the body paragraphs. Footnote
  // definitions are pulled out of the body flow.
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  const paragraphs: Paragraph[] = [];
  for (const node of tree.children) {
    if (node.type === "footnoteDefinition") {
      const definition = node as FootnoteDefinition;
      const footnoteId = context.footnoteIdByIdentifier.get(definition.identifier)!;
      const definitionParagraphs: Paragraph[] = [];
      for (const child of definition.children) {
        definitionParagraphs.push(...blockToDocx(child as BlockContent, context));
      }
      footnotes[String(footnoteId)] = {
        children: definitionParagraphs.length > 0 ? definitionParagraphs : [new Paragraph({})],
      };
      continue;
    }
    paragraphs.push(...blockToDocx(node as BlockContent, context));
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
            {
              level: 1,
              format: "decimal",
              text: "%2.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    ...(Object.keys(footnotes).length > 0 ? { footnotes } : {}),
    ...(context.collectedComments.length > 0
      ? {
          comments: {
            children: context.collectedComments.map((comment) => ({
              id: comment.id,
              author: COMMENT_AUTHOR,
              children: [new Paragraph({ children: [new TextRun({ text: comment.body })] })],
            })),
          },
        }
      : {}),
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
};
