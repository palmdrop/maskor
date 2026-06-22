import { describe, it, expect } from "vitest";
import { parseDocumentLinks } from "@maskor/shared";
import {
  resolveParsedLink,
  findLinkRanges,
  linkRouteFor,
  trailingLinkSpan,
  type LinkLookups,
} from "./resolver";

const lookups: LinkLookups = {
  fragments: new Map([["chapter-1", "frag-uuid"]]),
  notes: new Map([["setting", "note-uuid"]]),
  references: new Map([["city", "ref-uuid"]]),
  aspects: new Map([["grief", "aspect-uuid"]]),
};

const parseOne = (body: string) => parseDocumentLinks(body)[0]!;

describe("resolveParsedLink", () => {
  it("resolves a typed link to its uuid", () => {
    expect(resolveParsedLink(parseOne("[[notes/setting]]"), lookups)).toMatchObject({
      pathType: "notes",
      uuid: "note-uuid",
      label: "setting",
    });
  });

  it("marks a typed link to a missing entity as broken", () => {
    expect(resolveParsedLink(parseOne("[[notes/missing]]"), lookups).uuid).toBeNull();
  });

  it("uses the alias as the label", () => {
    expect(resolveParsedLink(parseOne("[[notes/setting|The Manor]]"), lookups).label).toBe(
      "The Manor",
    );
  });

  it("resolves a unique bare name across types", () => {
    expect(resolveParsedLink(parseOne("[[grief]]"), lookups)).toMatchObject({
      pathType: "aspects",
      uuid: "aspect-uuid",
    });
  });

  it("leaves an ambiguous bare name unresolved", () => {
    const ambiguous: LinkLookups = {
      ...lookups,
      notes: new Map([["dup", "note-dup"]]),
      aspects: new Map([["dup", "aspect-dup"]]),
    };
    expect(resolveParsedLink(parseOne("[[dup]]"), ambiguous).uuid).toBeNull();
  });
});

describe("findLinkRanges", () => {
  it("returns ranges with resolution for each link", () => {
    const ranges = findLinkRanges("a [[notes/setting]] b [[notes/missing]]", lookups);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ from: 2, raw: "[[notes/setting]]" });
    expect(ranges[0]!.resolved.uuid).toBe("note-uuid");
    expect(ranges[1]!.resolved.uuid).toBeNull();
  });
});

describe("linkRouteFor", () => {
  it("maps each type to its route", () => {
    expect(linkRouteFor("fragments", "u", "p").to).toBe(
      "/projects/$projectId/fragments/$fragmentId",
    );
    expect(linkRouteFor("aspects", "u", "p").params).toEqual({ projectId: "p", aspectId: "u" });
  });
});

describe("trailingLinkSpan", () => {
  it("consumes a closeBrackets-inserted `]]` right after the cursor", () => {
    expect(trailingLinkSpan("]]")).toBe(2);
    expect(trailingLinkSpan("]] trailing prose")).toBe(2);
  });

  it("consumes the tail of an existing link being edited (through its `]]`)", () => {
    // Editing `[[fragments/ol|d-key]]` with the caret after "ol": the text after the caret is the
    // remaining key plus the closing brackets — all of it is replaced.
    expect(trailingLinkSpan("d-key]]")).toBe(7);
  });

  it("returns 0 for an open link (no closing `]]` before a newline or the next `[[`)", () => {
    expect(trailingLinkSpan("")).toBe(0);
    expect(trailingLinkSpan(" rest of line")).toBe(0);
    expect(trailingLinkSpan("\n]]")).toBe(0);
    expect(trailingLinkSpan("foo [[notes/bar]]")).toBe(0);
  });
});
