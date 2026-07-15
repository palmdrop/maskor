import { describe, it, expect } from "bun:test";
import JSZip from "jszip";
import { markdownToDocx } from "../markdown-to-docx";
import { renderExport } from "../render-export";
import { assembleSequenceForExport } from "../assemble";
import type { Fragment } from "@maskor/shared";

// Unzip a packed .docx and return the text of the named part (or null when the
// part is absent — Word omits `comments.xml`/`footnotes.xml`-carried content when
// nothing references it, though the docx lib always writes the footnotes part).
const readDocxPart = async (bytes: Uint8Array, partName: string): Promise<string | null> => {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(partName);
  return file ? file.async("string") : null;
};

// All `<w:t>` text payloads of a part, joined — the human-visible text.
const textRuns = (xml: string): string =>
  (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
    .map((run) => run.replace(/<[^>]+>/g, ""))
    .join(" ");

describe("markdownToDocx — GFM footnotes lowered to Word footnotes", () => {
  it("lowers a footnote reference + definition into the footnotes part", async () => {
    const markdown = "The tide turned.[^mrs-dalloway]\n\n[^mrs-dalloway]: Mrs Dalloway — Woolf.";
    const bytes = await markdownToDocx(markdown);
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const footnotes = (await readDocxPart(bytes, "word/footnotes.xml"))!;

    expect(document).toContain('w:footnoteReference w:id="1"');
    expect(textRuns(footnotes)).toContain("Mrs Dalloway — Woolf.");
    // The GFM label text never leaks into the body.
    expect(textRuns(document)).not.toContain("mrs-dalloway");
  });

  it("points repeated references at one shared footnote id (dedupe)", async () => {
    const markdown = "Alpha.[^ulysses]\n\nBeta.[^ulysses]\n\n[^ulysses]: Ulysses — Joyce.";
    const bytes = await markdownToDocx(markdown);
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const footnotes = (await readDocxPart(bytes, "word/footnotes.xml"))!;

    const references = document.match(/w:footnoteReference w:id="1"/g) ?? [];
    expect(references).toHaveLength(2);
    // One definition only.
    expect(textRuns(footnotes).match(/Ulysses — Joyce\./g) ?? []).toHaveLength(1);
  });
});

describe("markdownToDocx — page-break separator lowered to a Word page break", () => {
  // Count of body paragraphs (`<w:p>`), excluding the section-properties element.
  const paragraphCount = (xml: string): number => (xml.match(/<w:p[ >]/g) ?? []).length;

  it("lowers a form-feed-only paragraph to `pageBreakBefore` on the next paragraph", async () => {
    const markdown = "First fragment.\n\n\f\n\nSecond fragment.";
    const bytes = await markdownToDocx(markdown);
    const document = (await readDocxPart(bytes, "word/document.xml"))!;

    // The break rides the following paragraph's properties, not its own paragraph.
    expect(document).toContain("<w:pageBreakBefore/>");
    expect(document).not.toContain('<w:br w:type="page"/>');
    // No standalone empty paragraph is emitted for the separator: just the two
    // fragment paragraphs survive.
    expect(paragraphCount(document)).toBe(2);
    // The form feed itself never reaches the XML (it is not a valid XML 1.0 character).
    expect(document).not.toContain("\f");
    expect(textRuns(document)).toContain("First fragment.");
    expect(textRuns(document)).toContain("Second fragment.");
  });

  it("rides the break onto a following heading (headings are Paragraphs too)", async () => {
    const markdown = "First fragment.\n\n\f\n\n## Second fragment heading";
    const bytes = await markdownToDocx(markdown);
    const document = (await readDocxPart(bytes, "word/document.xml"))!;

    // The heading paragraph carries both its style and the page break, and no
    // separate break paragraph is emitted.
    expect(document).toContain("<w:pageBreakBefore/>");
    expect(document).not.toContain('<w:br w:type="page"/>');
    expect(paragraphCount(document)).toBe(2);
    expect(document).not.toContain("\f");
    expect(textRuns(document)).toContain("Second fragment heading");
  });
});

describe("markdownToDocx — Margin markers lowered to Word comments", () => {
  it("wraps the paragraph in a comment range and drops the marker", async () => {
    const markdown = "The bridge groans. <!--c:m1-->";
    const bytes = await markdownToDocx(markdown, { commentBodies: { m1: "Heavy imagery." } });
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const comments = await readDocxPart(bytes, "word/comments.xml");

    expect(document).toContain('w:commentRangeStart w:id="1"');
    expect(document).toContain('w:commentRangeEnd w:id="1"');
    expect(document).toContain('w:commentReference w:id="1"');
    expect(textRuns(document)).not.toContain("<!--c:");
    expect(comments).not.toBeNull();
    expect(comments!).toContain('w:author="Maskor"');
    expect(textRuns(comments!)).toContain("Heavy imagery.");
  });

  it("wraps a heading's text when the marker rides the heading (notes with titles)", async () => {
    const markdown = "### Chapter One <!--c:maskor-note-frag-1-->\n\nBody.";
    const bytes = await markdownToDocx(markdown, {
      commentBodies: { "maskor-note-frag-1": "A whole-fragment note." },
    });
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const comments = (await readDocxPart(bytes, "word/comments.xml"))!;

    expect(document).toContain('w:commentRangeStart w:id="1"');
    expect(textRuns(document)).toContain("Chapter One");
    expect(textRuns(comments)).toContain("A whole-fragment note.");
  });

  it("lowers every marker when multiple markers trail one paragraph (nested ranges)", async () => {
    const markdown = "Prose.<!--c:a--><!--c:b-->";
    const bytes = await markdownToDocx(markdown, {
      commentBodies: { a: "First comment.", b: "Second comment." },
    });
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const comments = (await readDocxPart(bytes, "word/comments.xml"))!;

    // Two comments, nested: Start 1, Start 2, …runs…, End 2, End 1.
    expect(document).toContain('w:commentRangeStart w:id="1"');
    expect(document).toContain('w:commentRangeStart w:id="2"');
    expect(document).toContain('w:commentRangeEnd w:id="1"');
    expect(document).toContain('w:commentRangeEnd w:id="2"');
    expect(document).toContain('w:commentReference w:id="1"');
    expect(document).toContain('w:commentReference w:id="2"');
    // Both bodies present in document order (a before b) — neither is dropped.
    const commentTexts = textRuns(comments);
    expect(commentTexts).toContain("First comment.");
    expect(commentTexts).toContain("Second comment.");
    expect(textRuns(document)).not.toContain("<!--c:");
  });

  it("lowers a comment anchored to a list block (marker trails the last item)", async () => {
    const markdown = "- item one\n- item two<!--c:listmark-->";
    const bytes = await markdownToDocx(markdown, {
      commentBodies: { listmark: "About the second item." },
    });
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const comments = (await readDocxPart(bytes, "word/comments.xml"))!;

    expect(document).toContain('w:commentRangeStart w:id="1"');
    expect(document).toContain('w:commentRangeEnd w:id="1"');
    expect(textRuns(comments)).toContain("About the second item.");
    expect(textRuns(document)).not.toContain("<!--c:");
  });

  it("drops an inert marker with no matching comment body (no comment emitted)", async () => {
    const markdown = "Line. <!--c:ghost-->";
    const bytes = await markdownToDocx(markdown, { commentBodies: {} });
    const document = (await readDocxPart(bytes, "word/document.xml"))!;

    expect(document).not.toContain("w:commentRangeStart");
    expect(textRuns(document)).not.toContain("<!--c:");
    expect(textRuns(document)).toContain("Line.");
  });
});

describe("assembleSequenceForExport → renderExport docx — footnotes + comments together", () => {
  const makeFragment = (
    overrides: Partial<Fragment> & { uuid: string; key: string },
  ): Fragment => ({
    content: `Content of ${overrides.key}`,
    readiness: 1,
    contentHash: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    references: [],
    isDiscarded: false,
    aspects: {},
    ...overrides,
  });

  it("produces a docx with a real footnote (reference) and a Word comment (Margin)", async () => {
    const fragments = [
      makeFragment({ uuid: "frag-1", key: "opening", content: "The river was wide. <!--c:m1-->" }),
    ];
    const sequence = {
      uuid: "seq-1",
      name: "Main",
      isMain: true,
      sections: [
        {
          uuid: "section-1",
          name: "Chapter",
          fragments: [{ uuid: "pos-0", fragmentUuid: "frag-1", position: 0 }],
        },
      ],
    };
    const assembly = assembleSequenceForExport(
      sequence,
      fragments,
      {
        separator: "blank-line",
        showTitles: true,
        showSectionHeadings: true,
        includeAnchors: false,
      },
      {
        includeReferences: true,
        includeMarginAnnotations: true,
        byFragmentUuid: {
          "frag-1": {
            notes: "Sets the tone.",
            comments: [{ markerId: "m1", body: "Water motif." }],
            references: [{ key: "Heart of Darkness", body: "Conrad." }],
          },
        },
      },
    );

    const { bytes } = await renderExport(assembly, "docx");
    const document = (await readDocxPart(bytes, "word/document.xml"))!;
    const footnotes = (await readDocxPart(bytes, "word/footnotes.xml"))!;
    const comments = (await readDocxPart(bytes, "word/comments.xml"))!;

    // Reference lowered to a Word footnote.
    expect(document).toContain("w:footnoteReference");
    expect(textRuns(footnotes)).toContain("Heart of Darkness — Conrad.");
    // Both the notes (on the title heading) and the inline comment lowered to
    // Word comments.
    const commentTexts = textRuns(comments);
    expect(commentTexts).toContain("Sets the tone.");
    expect(commentTexts).toContain("Water motif.");
    expect(comments).toContain('w:author="Maskor"');
    // The synthetic notes marker and the real comment marker never leak as text.
    expect(textRuns(document)).not.toContain("<!--c:");
  });
});
