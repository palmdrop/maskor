import { describe, it, expect } from "bun:test";
import {
  splitMarkdown,
  splitPlainText,
  splitThematicBreak,
  splitBlankLine,
  splitByDelimiter,
} from "../index";

describe("splitMarkdown", () => {
  it("splits on a single heading level", () => {
    const content = "# First\nContent one\n# Second\nContent two";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ title: "First", content: "Content one" });
    expect(pieces[1]).toEqual({ title: "Second", content: "Content two" });
  });

  it("splits on mixed heading levels", () => {
    const content = "# H1 Title\nBody one\n## H2 Title\nBody two\n### H3 Title\nBody three";
    const pieces = splitMarkdown(content, 2);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ title: "H1 Title", content: "Body one" });
    expect(pieces[1]).toEqual({
      title: "H2 Title",
      content: "Body two\n### H3 Title\nBody three",
    });
  });

  it("does not split on heading inside fenced code block", () => {
    const content = "# Real heading\nSome text\n```\n# Not a heading\n```\nMore text";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.title).toBe("Real heading");
    expect(pieces[0]?.content).toContain("# Not a heading");
  });

  it("captures content before the first heading as a piece with no title", () => {
    const content = "Preamble content\n# First heading\nBody";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ title: undefined, content: "Preamble content" });
    expect(pieces[1]).toEqual({ title: "First heading", content: "Body" });
  });

  it("returns empty array for empty input", () => {
    expect(splitMarkdown("", 1)).toEqual([]);
  });

  it("returns single piece when no headings at the split level exist", () => {
    const content = "Some content\n## H2 heading\nMore content";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual({
      title: undefined,
      content: "Some content\n## H2 heading\nMore content",
    });
  });

  it("excludes the heading line from piece content", () => {
    const content = "# Title\nActual content";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.content).not.toContain("# Title");
    expect(pieces[0]?.content).toBe("Actual content");
  });

  it("does not emit empty pieces from back-to-back headings", () => {
    const content = "# First\n# Second\nContent";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual({ title: "Second", content: "Content" });
  });

  it("sub-headings below split level are included verbatim in content", () => {
    const content = "# H1\nIntro\n## H2\nSub content\n### H3\nDeep content\n# H1 again\nEnd";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.content).toContain("## H2");
    expect(pieces[0]?.content).toContain("### H3");
    expect(pieces[1]).toEqual({ title: "H1 again", content: "End" });
  });

  it("does not split on indented code block content", () => {
    const content = "# Real heading\nNormal text\n\n    # indented code\n\nMore text";
    const pieces = splitMarkdown(content, 1);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.title).toBe("Real heading");
  });
});

describe("splitPlainText", () => {
  it("splits on delimiter", () => {
    const content = "Part one\n---\nPart two\n---\nPart three";
    const pieces = splitPlainText(content, "---");
    expect(pieces).toHaveLength(3);
    expect(pieces[0]?.content).toContain("Part one");
    expect(pieces[1]?.content).toContain("Part two");
    expect(pieces[2]?.content).toContain("Part three");
  });

  it("returns no title for any piece", () => {
    const pieces = splitPlainText("A\n===\nB", "===");
    for (const piece of pieces) {
      expect(piece.title).toBeUndefined();
    }
  });

  it("does not emit empty pieces when delimiter is at start", () => {
    const content = "---\nContent only";
    const pieces = splitPlainText(content, "---");
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.content).toContain("Content only");
  });

  it("does not emit empty pieces when delimiter is at end", () => {
    const content = "Content only\n---";
    const pieces = splitPlainText(content, "---");
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.content).toContain("Content only");
  });

  it("returns a single piece when delimiter is not present", () => {
    const content = "Content without any delimiter";
    const pieces = splitPlainText(content, "---");
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.content).toBe("Content without any delimiter");
  });

  it("returns empty array for empty input", () => {
    expect(splitPlainText("", "---")).toEqual([]);
  });

  it("does not strip first non-empty line from piece content", () => {
    const content = "First line\nSecond line\n---\nAnother first\nAnother second";
    const pieces = splitPlainText(content, "---");
    expect(pieces[0]?.content).toContain("First line");
    expect(pieces[1]?.content).toContain("Another first");
  });

  it("handles multi-character delimiter", () => {
    const pieces = splitPlainText("A\n<<<SPLIT>>>\nB", "<<<SPLIT>>>");
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.content).toContain("A");
    expect(pieces[1]?.content).toContain("B");
  });
});

describe("splitThematicBreak", () => {
  it("cuts at each thematic break", () => {
    const content = "Part one\n\n---\n\nPart two\n\n---\n\nPart three";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toEqual({ content: "Part one" });
    expect(pieces[1]).toEqual({ content: "Part two" });
    expect(pieces[2]).toEqual({ content: "Part three" });
  });

  it("carries no title on any piece", () => {
    const pieces = splitThematicBreak("A\n\n---\n\nB");
    for (const piece of pieces) {
      expect(piece.title).toBeUndefined();
    }
  });

  it("returns a single piece when no break is present", () => {
    const content = "Just some prose\n\nwith two paragraphs";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual({ content });
  });

  it("does not cut on a `---` inside a fenced code block", () => {
    const content = "Before\n\n```\n---\n```\n\nAfter";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.content).toContain("---");
    expect(pieces[0]?.content).toContain("After");
  });

  it("does not cut on a setext underline", () => {
    const content = "Heading text\n---\n\nBody";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(1);
  });

  it("keeps leading content before the first break as a piece", () => {
    const content = "Lead in\n\n---\n\nRest";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ content: "Lead in" });
  });

  it("does not emit empty pieces from back-to-back breaks", () => {
    const content = "A\n\n---\n\n---\n\nB";
    const pieces = splitThematicBreak(content);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ content: "A" });
    expect(pieces[1]).toEqual({ content: "B" });
  });

  it("returns empty array for empty input", () => {
    expect(splitThematicBreak("")).toEqual([]);
  });
});

describe("splitBlankLine", () => {
  it("cuts at each blank-line boundary between top-level blocks", () => {
    const content = "Para one\n\nPara two\n\nPara three";
    const pieces = splitBlankLine(content);
    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toEqual({ content: "Para one" });
    expect(pieces[1]).toEqual({ content: "Para two" });
    expect(pieces[2]).toEqual({ content: "Para three" });
  });

  it("carries no title on any piece", () => {
    const pieces = splitBlankLine("A\n\nB");
    for (const piece of pieces) {
      expect(piece.title).toBeUndefined();
    }
  });

  it("keeps blocks separated by a single newline together", () => {
    const content = "# Heading\nImmediate body\n\nNext paragraph";
    const pieces = splitBlankLine(content);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.content).toBe("# Heading\nImmediate body");
    expect(pieces[1]?.content).toBe("Next paragraph");
  });

  it("does not cut on a blank line inside a fenced code block", () => {
    const content = "Before\n\n```\nline one\n\nline two\n```\n\nAfter";
    const pieces = splitBlankLine(content);
    expect(pieces).toHaveLength(3);
    expect(pieces[1]?.content).toContain("line one");
    expect(pieces[1]?.content).toContain("line two");
  });

  it("returns a single piece when there is no blank-line boundary", () => {
    const content = "Only one paragraph here";
    const pieces = splitBlankLine(content);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual({ content });
  });

  it("returns empty array for empty input", () => {
    expect(splitBlankLine("")).toEqual([]);
  });
});

describe("splitByDelimiter", () => {
  it("dispatches to heading mode", () => {
    const content = "# First\nOne\n# Second\nTwo";
    const pieces = splitByDelimiter(content, { type: "heading", level: 1 });
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ title: "First", content: "One" });
  });

  it("dispatches to thematic-break mode", () => {
    const pieces = splitByDelimiter("A\n\n---\n\nB", { type: "thematic-break" });
    expect(pieces).toHaveLength(2);
  });

  it("dispatches to blank-line mode", () => {
    const pieces = splitByDelimiter("A\n\nB", { type: "blank-line" });
    expect(pieces).toHaveLength(2);
  });

  it("returns a single piece when the delimiter does not occur", () => {
    const pieces = splitByDelimiter("No breaks here", { type: "thematic-break" });
    expect(pieces).toHaveLength(1);
  });
});
