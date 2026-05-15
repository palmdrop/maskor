import { describe, it, expect } from "bun:test";
import { computeWordCount } from "../suggestion/word-count";

describe("computeWordCount — plain prose", () => {
  it("counts whitespace-separated tokens", () => {
    expect(computeWordCount("The lights flickered at dusk")).toBe(5);
  });

  it("returns 0 for empty string", () => {
    expect(computeWordCount("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(computeWordCount("   \n\t  ")).toBe(0);
  });

  it("handles leading and trailing whitespace", () => {
    expect(computeWordCount("  hello world  ")).toBe(2);
  });

  it("handles multiple spaces between words", () => {
    expect(computeWordCount("one  two   three")).toBe(3);
  });

  it("handles newlines as whitespace", () => {
    expect(computeWordCount("line one\nline two\nline three")).toBe(6);
  });
});

describe("computeWordCount — fenced code blocks", () => {
  it("strips fenced code blocks", () => {
    const content = "Before.\n```\nconst x = 1;\n```\nAfter.";
    expect(computeWordCount(content)).toBe(2);
  });

  it("strips multiple fenced code blocks", () => {
    const content = "```\ncode one\n```\nMiddle word.\n```\ncode two\n```";
    expect(computeWordCount(content)).toBe(2);
  });

  it("counts nothing for content that is only a fenced code block", () => {
    expect(computeWordCount("```\nsome code here\n```")).toBe(0);
  });
});

describe("computeWordCount — inline code", () => {
  it("strips inline code", () => {
    expect(computeWordCount("Call `doSomething()` now.")).toBe(2);
  });

  it("strips multiple inline code spans", () => {
    // "`foo`" and "`bar`" are stripped — only "and" and "done" remain
    expect(computeWordCount("`foo` and `bar` done")).toBe(2);
  });
});

describe("computeWordCount — link URLs", () => {
  it("replaces link with just the display text", () => {
    expect(computeWordCount("[click here](https://example.com)")).toBe(2);
  });

  it("counts empty link text as nothing", () => {
    expect(computeWordCount("[](https://example.com)")).toBe(0);
  });

  it("handles multiple links", () => {
    expect(computeWordCount("See [docs](url1) and [guide](url2).")).toBe(4);
  });
});

describe("computeWordCount — combined", () => {
  it("strips code and links before counting", () => {
    // Link becomes "the docs"; inline code is stripped leaving a trailing "."
    // tokens: Hello, world., See, the, docs, or, run, . → 8
    const content = "Hello world. See [the docs](https://docs.example.com) or run `npm install`.";
    expect(computeWordCount(content)).toBe(8);
  });
});
