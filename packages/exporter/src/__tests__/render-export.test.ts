import { describe, it, expect } from "bun:test";
import { renderExport } from "../render-export";

const SAMPLE_MARKDOWN =
  "## Chapter One\n\nThe river was wide that morning.\n\n---\n\nHe crossed it anyway.";

describe("renderExport — md", () => {
  it("returns UTF-8 bytes of the input string unchanged", async () => {
    const { bytes, mimeType, extension } = await renderExport(SAMPLE_MARKDOWN, "md");
    expect(new TextDecoder().decode(bytes)).toBe(SAMPLE_MARKDOWN);
    expect(mimeType).toBe("text/markdown");
    expect(extension).toBe("md");
  });
});

describe("renderExport — txt", () => {
  it("returns the same bytes as md but with txt extension and plain mime", async () => {
    const { bytes, mimeType, extension } = await renderExport(SAMPLE_MARKDOWN, "txt");
    expect(new TextDecoder().decode(bytes)).toBe(SAMPLE_MARKDOWN);
    expect(mimeType).toBe("text/plain");
    expect(extension).toBe("txt");
  });
});

describe("renderExport — docx", () => {
  it("returns a valid docx zip (PK magic bytes)", async () => {
    const { bytes, mimeType, extension } = await renderExport(SAMPLE_MARKDOWN, "docx");
    // docx is a zip — begins with PK (0x50 0x4b)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(extension).toBe("docx");
  });

  it("docx contains word/document.xml", async () => {
    const { bytes } = await renderExport(SAMPLE_MARKDOWN, "docx");
    // Scan the zip for the document.xml entry name (ASCII-safe subset of zip structure)
    const text = Buffer.from(bytes).toString("ascii");
    expect(text).toContain("word/document.xml");
  });

  it("handles empty markdown without throwing", async () => {
    const { bytes } = await renderExport("", "docx");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("handles bold, italic, headings, list, thematic break", async () => {
    const md = "# Title\n\n**bold** and _italic_\n\n- item one\n- item two\n\n---\n\n> blockquote";
    const { bytes } = await renderExport(md, "docx");
    const text = Buffer.from(bytes).toString("ascii");
    expect(text).toContain("word/document.xml");
  });
});
