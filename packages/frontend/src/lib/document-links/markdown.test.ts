import { describe, it, expect } from "vitest";
import { unescapeDocumentLinks } from "./markdown";

describe("unescapeDocumentLinks", () => {
  it("collapses escaped brackets back to a clean link", () => {
    expect(unescapeDocumentLinks("see \\[\\[notes/setting\\]\\] here")).toBe(
      "see [[notes/setting]] here",
    );
  });

  it("unescapes inner specials (e.g. underscores in a key)", () => {
    expect(unescapeDocumentLinks("\\[\\[notes/my\\_note\\]\\]")).toBe("[[notes/my_note]]");
  });

  it("handles an aliased link", () => {
    expect(unescapeDocumentLinks("\\[\\[notes/key|the alias\\]\\]")).toBe(
      "[[notes/key|the alias]]",
    );
  });

  it("leaves an already-clean link untouched (idempotent)", () => {
    expect(unescapeDocumentLinks("[[notes/setting]]")).toBe("[[notes/setting]]");
    expect(unescapeDocumentLinks(unescapeDocumentLinks("\\[\\[notes/x\\]\\]"))).toBe("[[notes/x]]");
  });

  it("does not touch prose without escaped link spans", () => {
    expect(unescapeDocumentLinks("plain prose, no links")).toBe("plain prose, no links");
  });

  it("rewrites multiple links in one body", () => {
    expect(unescapeDocumentLinks("\\[\\[references/a\\]\\] and \\[\\[aspects/b\\]\\]")).toBe(
      "[[references/a]] and [[aspects/b]]",
    );
  });
});
