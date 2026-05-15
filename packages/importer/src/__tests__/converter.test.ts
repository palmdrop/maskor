import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { MammothConverter } from "../index";

const fixturePath = join(import.meta.dir, "fixtures", "sample.docx");

describe("MammothConverter", () => {
  it("converts a docx file to markdown with ATX headings", async () => {
    const buffer = readFileSync(fixturePath);
    const input = new Uint8Array(buffer);
    const converter = new MammothConverter();
    const markdown = await converter.toMarkdown(input);

    expect(markdown).toContain("# Introduction");
    expect(markdown).toContain("## Section One");
    expect(markdown).toContain("### Sub-section");
  });

  it("preserves body text as plain markdown paragraphs", async () => {
    const buffer = readFileSync(fixturePath);
    const input = new Uint8Array(buffer);
    const converter = new MammothConverter();
    const markdown = await converter.toMarkdown(input);

    expect(markdown).toContain("This is the intro paragraph.");
    expect(markdown).toContain("Body text under section one.");
    expect(markdown).toContain("Body text under sub-section.");
  });

  it("returns a string (implements DocumentConverter interface)", async () => {
    const buffer = readFileSync(fixturePath);
    const input = new Uint8Array(buffer);
    const converter = new MammothConverter();
    const result = await converter.toMarkdown(input);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
