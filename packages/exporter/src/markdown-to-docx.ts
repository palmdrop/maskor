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
  PageBreak,
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

// Baseline document typography. Not typesetting — just sensible reading defaults
// so a raw export opens as readable prose in Word: Garamond 12pt body text with
// one line worth of vertical space between paragraphs (Word sizes are half-points;
// spacing is twips, 240 = 12pt = one line at the body size).
const DOCUMENT_FONT = "Garamond";
const DOCUMENT_FONT_SIZE_HALF_POINTS = 24;
const PARAGRAPH_SPACING_AFTER_TWIPS = 240;

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
  // present here (anywhere in a paragraph/heading) becomes a Word comment.
  commentBodies: Record<string, string>;
  collectedComments: CollectedComment[];
  allocateCommentId: () => number;
};

type RunOptions = { bold?: boolean; italic?: boolean };

// The marker ids of every `<!--c:ID-->` inline-HTML node in the tree, in
// document order (empty when none). A marker anywhere in the block anchors it —
// not just a trailing one: a soft-wrapped paragraph puts a line-end marker
// mid-node-list, and the assembler's notes marker rides the first line of a
// possibly multi-line opening paragraph. The Word comment range spans the whole
// anchored paragraph anyway (block-granular anchoring), so position within the
// block does not matter. Recurses into emphasis/strong/etc. so a marker nested
// in phrasing content is still found.
const commentMarkerIds = (nodes: PhrasingContent[]): string[] => {
  const markerIds: string[] = [];
  for (const node of nodes) {
    if (node.type === "html") {
      const match = COMMENT_MARKER_NODE_PATTERN.exec((node as Html).value);
      if (match) markerIds.push(match[1]!);
      continue;
    }
    const children = (node as { children?: PhrasingContent[] }).children;
    if (children) markerIds.push(...commentMarkerIds(children));
  }
  return markerIds;
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
// bound marker it carries. Returns the runs unchanged when none of the markers
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

// True when a paragraph is exactly the assembler's page-break separator: a
// single text node whose value is the form feed character.
const isPageBreakParagraph = (node: MdastParagraph): boolean =>
  node.children.length === 1 &&
  node.children[0]!.type === "text" &&
  (node.children[0] as Text).value === "\f";

// Convert block-level mdast nodes to docx Paragraphs.
// `indentLeft` (twips) is threaded through for blockquote nesting.
// `pageBreakBefore` rides a preceding page-break separator onto the first
// Paragraph this block emits, so the break needs no empty paragraph of its own.
const blockToDocx = (
  node: BlockContent | Content,
  context: DocxContext,
  indentLeft = 0,
  pageBreakBefore = false,
): Paragraph[] => {
  // Options for the very first Paragraph this block emits; empty for the rest.
  const firstParagraphExtras = pageBreakBefore ? { pageBreakBefore: true } : {};

  switch (node.type) {
    case "heading": {
      const headingNode = node as Heading;
      const markerIds = commentMarkerIds(headingNode.children);
      const runs = phrasingToRuns(headingNode.children, context);
      return [
        new Paragraph({
          ...firstParagraphExtras,
          heading: HEADING_LEVEL_MAP[headingNode.depth] ?? HeadingLevel.HEADING_6,
          children: withCommentRanges(runs, markerIds, context),
        }),
      ];
    }

    case "paragraph": {
      const paragraphNode = node as MdastParagraph;
      // A form-feed-only paragraph is the assembler's page-break separator. The
      // root walk intercepts it (lowering to `pageBreakBefore` on the next
      // block), so this only fires for a `\f` paragraph nested inside another
      // block (blockquote, footnote definition). Word cannot carry a raw form
      // feed (invalid XML character), so still emit a real page break there.
      if (isPageBreakParagraph(paragraphNode)) {
        return [new Paragraph({ ...firstParagraphExtras, children: [new PageBreak()] })];
      }
      const markerIds = commentMarkerIds(paragraphNode.children);
      const runs = phrasingToRuns(paragraphNode.children, context);
      return [
        new Paragraph({
          ...firstParagraphExtras,
          ...(indentLeft > 0 ? { indent: { left: indentLeft } } : {}),
          children: withCommentRanges(runs, markerIds, context),
        }),
      ];
    }

    case "blockquote": {
      const blockquoteNode = node as Blockquote;
      const paragraphs: Paragraph[] = [];
      blockquoteNode.children.forEach((child, index) => {
        paragraphs.push(
          ...blockToDocx(
            child as BlockContent,
            context,
            indentLeft + 720,
            index === 0 ? pageBreakBefore : false,
          ),
        );
      });
      return paragraphs;
    }

    case "code": {
      const codeNode = node as Code;
      const lines = codeNode.value.split("\n");
      return lines.map(
        (line, index) =>
          new Paragraph({
            ...(index === 0 ? firstParagraphExtras : {}),
            indent: { left: 720 },
            // The document-default paragraph spacing would tear the block apart
            // line by line; only the last line keeps the gap to the next block.
            ...(index < lines.length - 1 ? { spacing: { after: 0 } } : {}),
            children: [new TextRun({ text: line, font: "Courier New" })],
          }),
      );
    }

    case "thematicBreak": {
      return [new Paragraph({ ...firstParagraphExtras, thematicBreak: true })];
    }

    case "list": {
      const listNode = node as List;
      const paragraphs: Paragraph[] = [];

      // Consumed by the first list item's paragraph so a preceding page break
      // rides it; a no-op for every later paragraph.
      let remainingFirstExtras = pageBreakBefore;
      const consumeFirstParagraphExtras = () => {
        if (!remainingFirstExtras) return {};
        remainingFirstExtras = false;
        return { pageBreakBefore: true } as const;
      };

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
          const markerIds = commentMarkerIds(phrasingChildren);
          paragraphs.push(
            new Paragraph({
              ...consumeFirstParagraphExtras(),
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
        return [
          new Paragraph({
            ...firstParagraphExtras,
            children: [new TextRun({ text: unknown.value })],
          }),
        ];
      }
      return [];
    }
  }
};

export type MarkdownToDocxOptions = {
  // `{ markerId → comment body }` side-channel from the docx-bound assembly. Every
  // marker present here becomes a Word comment on the paragraph/heading carrying it.
  commentBodies?: Record<string, string>;
};

/**
 * Convert an assembled markdown string to a .docx file buffer.
 * Structural conversion with baseline typography defaults (Garamond 12pt, one
 * line of space between paragraphs) — no templates, themes, or page layout.
 * GFM footnote references/definitions lower to real Word footnotes, and Margin
 * markers (against `options.commentBodies`) lower to Word comments.
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
  // The assembler's page-break separator is a form-feed-only paragraph. Rather
  // than emitting a standalone break paragraph (which strands a blank first line
  // at the top of the new page), skip it and flag the next emitted block's first
  // Paragraph with `pageBreakBefore`. A trailing separator with no following
  // block is dropped; consecutive separators collapse to one flag.
  let pendingPageBreakBefore = false;
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
    if (node.type === "paragraph" && isPageBreakParagraph(node as MdastParagraph)) {
      pendingPageBreakBefore = true;
      continue;
    }
    const blocks = blockToDocx(node as BlockContent, context, 0, pendingPageBreakBefore);
    // Keep the flag pending if the block produced no paragraph to carry it, so
    // the break rides the next real block instead of being lost.
    if (blocks.length > 0) pendingPageBreakBefore = false;
    paragraphs.push(...blocks);
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: DOCUMENT_FONT, size: DOCUMENT_FONT_SIZE_HALF_POINTS },
          paragraph: { spacing: { after: PARAGRAPH_SPACING_AFTER_TWIPS } },
        },
      },
    },
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
