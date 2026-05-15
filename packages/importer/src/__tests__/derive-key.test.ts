import { describe, it, expect } from "bun:test";
import { deriveKey } from "../index";

describe("deriveKey", () => {
  it("uses heading text as the primary candidate", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "My Heading", content: "some content" }, existing);
    expect(key).toBe("My Heading");
    expect(existing.has("my heading")).toBe(true);
  });

  it("falls back to first non-empty line of content when no heading text", () => {
    const existing = new Set<string>();
    const key = deriveKey({ content: "First line\nSecond line" }, existing);
    expect(key).toBe("First line");
  });

  it("falls back to fragment-<uuid> when both heading and content sanitize to empty", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "!!!@@@", content: "###$$$" }, existing);
    expect(key).toMatch(/^fragment-[0-9a-f-]{36}$/);
  });

  it("strips characters outside [a-zA-Z0-9 _-] from heading text", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "Hello, World! (2024)", content: "x" }, existing);
    expect(key).toBe("Hello World 2024");
  });

  it("strips unicode characters from heading text", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "Héllo Wörld", content: "x" }, existing);
    expect(key).toBe("Hllo Wrld");
  });

  it("collapses multiple whitespace into single space and trims", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "  Hello   World  ", content: "x" }, existing);
    expect(key).toBe("Hello World");
  });

  it("falls through heading to content when heading sanitizes to empty", () => {
    const existing = new Set<string>();
    const key = deriveKey({ headingText: "!!!@@@", content: "Valid content line" }, existing);
    expect(key).toBe("Valid content line");
  });

  it("skips empty lines to find first non-empty line of content", () => {
    const existing = new Set<string>();
    const key = deriveKey({ content: "\n   \nActual content" }, existing);
    expect(key).toBe("Actual content");
  });

  it("is case-insensitive for collision detection", () => {
    const existing = new Set<string>(["my heading"]);
    const key = deriveKey({ headingText: "My Heading", content: "x" }, existing);
    expect(key).toBe("My Heading_1");
  });

  it("preserves original casing in the returned key", () => {
    const existing = new Set<string>(["my heading"]);
    const key = deriveKey({ headingText: "MY HEADING", content: "x" }, existing);
    expect(key).toBe("MY HEADING_1");
  });

  it("appends _1, _2, _3 on collision chain", () => {
    const existing = new Set<string>(["title", "title_1", "title_2"]);
    const key = deriveKey({ headingText: "Title", content: "x" }, existing);
    expect(key).toBe("Title_3");
  });

  it("mutates existingKeys to include the lowercased returned key", () => {
    const existing = new Set<string>();
    deriveKey({ headingText: "Fragment Key", content: "x" }, existing);
    expect(existing.has("fragment key")).toBe(true);
  });

  it("collision chain: _1 and _2 also added to existingKeys over successive calls", () => {
    const existing = new Set<string>();
    const key1 = deriveKey({ headingText: "Alpha", content: "x" }, existing);
    const key2 = deriveKey({ headingText: "Alpha", content: "x" }, existing);
    const key3 = deriveKey({ headingText: "ALPHA", content: "x" }, existing);
    expect(key1).toBe("Alpha");
    expect(key2).toBe("Alpha_1");
    expect(key3).toBe("ALPHA_2");
  });

  it("sanitizes content first-line when falling back", () => {
    const existing = new Set<string>();
    const key = deriveKey({ content: "Hello, (World)!\nother" }, existing);
    expect(key).toBe("Hello World");
  });
});
