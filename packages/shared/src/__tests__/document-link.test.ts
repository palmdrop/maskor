import { describe, it, expect } from "bun:test";
import {
  parseDocumentLinks,
  buildDocumentLink,
  rewriteDocumentLinks,
  linkPathTypeToEntityKind,
  entityKindToLinkPathType,
  deriveInlineLinkMetadata,
  stripDocumentLinkMarkup,
} from "../utils/document-link";

describe("parseDocumentLinks", () => {
  it("parses a full-path link", () => {
    const links = parseDocumentLinks("see [[notes/setting-notes]] here");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      targetType: "notes",
      targetKey: "setting-notes",
      alias: null,
      raw: "[[notes/setting-notes]]",
    });
  });

  it("parses an aliased link", () => {
    const links = parseDocumentLinks("[[notes/old-key|the manor]]");
    expect(links[0]).toMatchObject({
      targetType: "notes",
      targetKey: "old-key",
      alias: "the manor",
    });
  });

  it("parses a bare-name link with a null type", () => {
    const links = parseDocumentLinks("[[the-river]]");
    expect(links[0]).toMatchObject({ targetType: null, targetKey: "the-river", alias: null });
  });

  it("strips a .md suffix", () => {
    const links = parseDocumentLinks("[[notes/foo.md]]");
    expect(links[0]).toMatchObject({ targetType: "notes", targetKey: "foo" });
  });

  it("accepts keys with spaces", () => {
    const links = parseDocumentLinks("[[notes/my note|Display]]");
    expect(links[0]).toMatchObject({ targetType: "notes", targetKey: "my note", alias: "Display" });
  });

  it("ignores an unrecognised type prefix", () => {
    expect(parseDocumentLinks("[[gibberish/foo]]")).toHaveLength(0);
  });

  it("ignores an empty target", () => {
    expect(parseDocumentLinks("[[]]")).toHaveLength(0);
  });

  it("returns links in document order with offsets", () => {
    const body = "a [[notes/one]] b [[aspects/two]]";
    const links = parseDocumentLinks(body);
    expect(links.map((link) => link.targetKey)).toEqual(["one", "two"]);
    expect(links[0]!.index).toBe(2);
    expect(body.slice(links[1]!.index)).toStartWith("[[aspects/two]]");
  });

  it("handles all four linkable types", () => {
    const body = "[[fragments/a]] [[notes/b]] [[references/c]] [[aspects/d]]";
    expect(parseDocumentLinks(body).map((link) => link.targetType)).toEqual([
      "fragments",
      "notes",
      "references",
      "aspects",
    ]);
  });
});

describe("buildDocumentLink", () => {
  it("builds a canonical full-path link", () => {
    expect(buildDocumentLink("aspects", "the-river")).toBe("[[aspects/the-river]]");
  });

  it("builds an aliased link", () => {
    expect(buildDocumentLink("notes", "old-key", "the manor")).toBe("[[notes/old-key|the manor]]");
  });
});

describe("rewriteDocumentLinks", () => {
  it("rewrites a full-path link to the new key", () => {
    expect(rewriteDocumentLinks("[[notes/old-key]]", "notes", "old-key", "new-key")).toBe(
      "[[notes/new-key]]",
    );
  });

  it("preserves the alias", () => {
    expect(rewriteDocumentLinks("[[notes/old-key|the manor]]", "notes", "old-key", "new-key")).toBe(
      "[[notes/new-key|the manor]]",
    );
  });

  it("leaves unrelated links and bare names untouched", () => {
    const body = "[[notes/old-key]] [[aspects/old-key]] [[old-key]]";
    expect(rewriteDocumentLinks(body, "notes", "old-key", "new-key")).toBe(
      "[[notes/new-key]] [[aspects/old-key]] [[old-key]]",
    );
  });

  it("rewrites every occurrence", () => {
    expect(rewriteDocumentLinks("[[notes/a]] x [[notes/a]]", "notes", "a", "b")).toBe(
      "[[notes/b]] x [[notes/b]]",
    );
  });
});

describe("deriveInlineLinkMetadata", () => {
  it("collects reference and aspect keys, ignoring notes/fragments/bare", () => {
    const body =
      "[[references/a]] [[aspects/b]] [[notes/c]] [[fragments/d]] [[bare]] [[references/a]]";
    expect(deriveInlineLinkMetadata(body)).toEqual({
      referenceKeys: ["a"],
      aspectKeys: ["b"],
    });
  });

  it("returns empty arrays for a body with no links", () => {
    expect(deriveInlineLinkMetadata("plain prose")).toEqual({
      referenceKeys: [],
      aspectKeys: [],
    });
  });
});

describe("path type <-> entity kind", () => {
  it("round-trips", () => {
    expect(linkPathTypeToEntityKind("fragments")).toBe("fragment");
    expect(linkPathTypeToEntityKind("aspects")).toBe("aspect");
    expect(entityKindToLinkPathType("note")).toBe("notes");
    expect(entityKindToLinkPathType("reference")).toBe("references");
  });
});

describe("stripDocumentLinkMarkup", () => {
  it("replaces a full-path link with its key", () => {
    expect(stripDocumentLinkMarkup("see [[notes/setting-notes]] here")).toBe(
      "see setting-notes here",
    );
  });

  it("replaces an aliased link with its alias", () => {
    expect(stripDocumentLinkMarkup("see [[notes/setting-notes|the manor]] here")).toBe(
      "see the manor here",
    );
  });

  it("strips multiple links and leaves surrounding prose intact", () => {
    expect(stripDocumentLinkMarkup("[[references/a]] and [[aspects/b|Beta]] done")).toBe(
      "a and Beta done",
    );
  });

  it("leaves text without links untouched", () => {
    expect(stripDocumentLinkMarkup("plain prose, no links")).toBe("plain prose, no links");
  });

  it("ignores an unknown-type pseudo-link", () => {
    expect(stripDocumentLinkMarkup("[[gibberish/foo]] stays")).toBe("[[gibberish/foo]] stays");
  });
});
