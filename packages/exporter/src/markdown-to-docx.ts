import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { fromMarkdown } from "mdast-util-from-markdown";
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

type RunOptions = { bold?: boolean; italic?: boolean };

// Walk a phrasing-content node tree into TextRun[]s.
const phrasingToRuns = (nodes: PhrasingContent[], options: RunOptions = {}): TextRun[] => {
  const runs: TextRun[] = [];

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
        runs.push(...phrasingToRuns((node as Strong).children, { ...options, bold: true }));
        break;
      }
      case "emphasis": {
        runs.push(...phrasingToRuns((node as Emphasis).children, { ...options, italic: true }));
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

// Convert block-level mdast nodes to docx Paragraphs.
// `indentLeft` (twips) is threaded through for blockquote nesting.
const blockToDocx = (node: BlockContent | Content, indentLeft = 0): Paragraph[] => {
  switch (node.type) {
    case "heading": {
      const headingNode = node as Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVEL_MAP[headingNode.depth] ?? HeadingLevel.HEADING_6,
          children: phrasingToRuns(headingNode.children),
        }),
      ];
    }

    case "paragraph": {
      const paragraphNode = node as MdastParagraph;
      return [
        new Paragraph({
          ...(indentLeft > 0 ? { indent: { left: indentLeft } } : {}),
          children: phrasingToRuns(paragraphNode.children),
        }),
      ];
    }

    case "blockquote": {
      const blockquoteNode = node as Blockquote;
      const paragraphs: Paragraph[] = [];
      for (const child of blockquoteNode.children) {
        paragraphs.push(...blockToDocx(child as BlockContent, indentLeft + 720));
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
          const runs: TextRun[] = [];
          for (const child of item.children) {
            if (child.type === "paragraph") {
              runs.push(...phrasingToRuns((child as MdastParagraph).children));
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

/**
 * Convert an assembled markdown string to a .docx file buffer.
 * Raw structural conversion only — no styling, themes, or page layout.
 * Unknown nodes fall back to plain text; nothing throws.
 */
export const markdownToDocx = async (markdown: string): Promise<Uint8Array> => {
  const tree = fromMarkdown(markdown) as Root;
  const paragraphs: Paragraph[] = [];

  for (const node of tree.children) {
    paragraphs.push(...blockToDocx(node as BlockContent));
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
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
};
