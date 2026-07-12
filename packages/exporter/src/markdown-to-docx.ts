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

// The marker id of a trailing `<!--c:ID-->` inline-HTML node, or null. Trailing
// whitespace-only text nodes and footnote references are skipped: the docx-bound
// assembly appends reference footnotes to the same line, so a comment marker can
// sit just before them yet still anchor its block.
const trailingCommentMarkerId = (nodes: PhrasingContent[]): string | null => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (node.type === "text" && (node as Text).value.trim().length === 0) continue;
    if (node.type === "footnoteReference") continue;
    if (node.type === "html") {
      const match = COMMENT_MARKER_NODE_PATTERN.exec((node as Html).value);
      return match ? match[1]! : null;
    }
    return null;
  }
  return null;
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

// Wrap a paragraph/heading's runs in a Word comment range when a bound marker
// trails it. Returns the runs unchanged when there is no bound comment.
const withCommentRange = (
  runs: (TextRun | FootnoteReferenceRun)[],
  markerId: string | null,
  context: DocxContext,
): (TextRun | FootnoteReferenceRun | CommentRangeStart | CommentRangeEnd)[] => {
  if (markerId === null) return runs;
  const body = context.commentBodies[markerId];
  if (body === undefined) return runs; // inert marker — no comment to attach
  const commentId = context.allocateCommentId();
  context.collectedComments.push({ id: commentId, body });
  return [
    new CommentRangeStart(commentId),
    ...runs,
    new CommentRangeEnd(commentId),
    new TextRun({ children: [new CommentReference(commentId)] }),
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
      const markerId = trailingCommentMarkerId(headingNode.children);
      const runs = phrasingToRuns(headingNode.children, context);
      return [
        new Paragraph({
          heading: HEADING_LEVEL_MAP[headingNode.depth] ?? HeadingLevel.HEADING_6,
          children: withCommentRange(runs, markerId, context),
        }),
      ];
    }

    case "paragraph": {
      const paragraphNode = node as MdastParagraph;
      const markerId = trailingCommentMarkerId(paragraphNode.children);
      const runs = phrasingToRuns(paragraphNode.children, context);
      return [
        new Paragraph({
          ...(indentLeft > 0 ? { indent: { left: indentLeft } } : {}),
          children: withCommentRange(runs, markerId, context),
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
          for (const child of item.children) {
            if (child.type === "paragraph") {
              runs.push(...phrasingToRuns((child as MdastParagraph).children, context));
            }
          }
          paragraphs.push(
            new Paragraph({
              bullet: ordered ? undefined : { level: depth },
              numbering: ordered ? { reference: "default-numbering", level: depth } : undefined,
              children: runs,
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
