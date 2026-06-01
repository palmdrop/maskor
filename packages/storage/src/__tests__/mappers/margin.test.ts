import { describe, it, expect } from "bun:test";
import { fromFile, toFile, serializeMarginBody } from "../../vault/markdown/mappers/margin";
import { parseFile } from "../../vault/markdown/parse";
import type { Margin } from "@maskor/shared";

const makeMargin = (overrides: Partial<Margin> = {}): Margin => ({
  fragmentUuid: "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
  fragmentKey: "the-bridge",
  notes: "Thoughts on structure.",
  comments: [
    { markerId: "aaa", excerpt: "The bridge groans.", body: "Too literal — rework." },
    { markerId: "bbb", excerpt: "She paused.", body: "Good beat here." },
  ],
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-01T11:00:00.000Z"),
  ...overrides,
});

describe("margin.fromFile", () => {
  it("derives fragmentKey from the filename stem", () => {
    const parsed = parseFile(
      "---\nfragmentUuid: f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b\n---\n## Notes\n\n## Comments\n",
    );
    const margin = fromFile(parsed, "the-bridge.md");
    expect(margin.fragmentKey).toBe("the-bridge");
    expect(margin.fragmentUuid).toBe("f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b");
  });

  it("parses notes and comments sections", () => {
    const body = [
      "## Notes",
      "",
      "Whole-fragment thinking.",
      "",
      "## Comments",
      "",
      "<!--c:aaa-->",
      "> The bridge groans.",
      "Too literal — rework.",
      "",
      "<!--c:bbb-->",
      "> She paused.",
      "Good beat here.",
    ].join("\n");
    const margin = fromFile(
      parseFile(`---\nfragmentUuid: f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b\n---\n${body}\n`),
      "the-bridge.md",
    );
    expect(margin.notes).toBe("Whole-fragment thinking.");
    expect(margin.comments).toEqual([
      { markerId: "aaa", excerpt: "The bridge groans.", body: "Too literal — rework." },
      { markerId: "bbb", excerpt: "She paused.", body: "Good beat here." },
    ]);
  });

  it("preserves fragmentUuid even when the filename stem disagrees (external-rename mismatch)", () => {
    // An external rename moves the file but leaves frontmatter intact: the uuid is the authoritative
    // join, the stem is just the (now-stale) key.
    const parsed = parseFile(
      "---\nfragmentUuid: f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b\n---\n## Notes\n\n## Comments\n",
    );
    const margin = fromFile(parsed, "renamed-externally.md");
    expect(margin.fragmentKey).toBe("renamed-externally");
    expect(margin.fragmentUuid).toBe("f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b");
  });
});

describe("margin serialization round-trip", () => {
  it("survives toFile -> parse -> fromFile with full fidelity", () => {
    const margin = makeMargin();
    const { frontmatter, body } = toFile(margin);
    const reparsed = fromFile(
      parseFile(`---\nfragmentUuid: ${frontmatter.fragmentUuid}\n---\n${body}\n`),
      "the-bridge.md",
    );
    expect(reparsed.notes).toBe(margin.notes);
    expect(reparsed.comments).toEqual(margin.comments);
    expect(reparsed.fragmentUuid).toBe(margin.fragmentUuid);
  });

  it("emits both headings even when notes and comments are empty", () => {
    const body = serializeMarginBody("", []);
    expect(body).toContain("## Notes");
    expect(body).toContain("## Comments");
    const reparsed = fromFile(
      parseFile(`---\nfragmentUuid: f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b\n---\n${body}\n`),
      "the-bridge.md",
    );
    expect(reparsed.notes).toBe("");
    expect(reparsed.comments).toEqual([]);
  });

  it("serializes a comment as marker + blockquote excerpt + body", () => {
    const body = serializeMarginBody("", [
      { markerId: "aaa", excerpt: "The bridge groans.", body: "Too literal." },
    ]);
    expect(body).toContain("<!--c:aaa-->\n> The bridge groans.\nToo literal.");
  });

  it("handles a comment with no excerpt or body", () => {
    const stub = { markerId: "ccc", excerpt: "", body: "" };
    const body = serializeMarginBody("", [stub]);
    const reparsed = fromFile(
      parseFile(`---\nfragmentUuid: f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b\n---\n${body}\n`),
      "the-bridge.md",
    );
    expect(reparsed.comments).toEqual([stub]);
  });
});
