import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/note";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Note } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "note-0001-0000-0000-000000000001",
  },
  inlineFields: {},
  body: "The bridge detail might be too literal.",
};

describe("note.fromFile", () => {
  it("derives key from filename stem", () => {
    const note = fromFile(PARSED, "bridge observation.md");
    expect(note.uuid as string).toBe("note-0001-0000-0000-000000000001");
    expect(note.key).toBe("bridge observation");
    expect(note.content).toBe("The bridge detail might be too literal.");
  });

  it("strips .md extension from key", () => {
    const note = fromFile(PARSED, "notes/bridge-observation.md");
    expect(note.key).toBe("bridge-observation");
  });

  it("captures unmanaged frontmatter keys into extraFrontmatter (uuid excluded)", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, tags: ["wip"], aliases: ["solitude"] },
    };
    const note = fromFile(parsed, "bridge.md");
    expect(note.extraFrontmatter?.uuid).toBeUndefined();
    expect(note.extraFrontmatter?.tags).toEqual(["wip"]);
    expect(note.extraFrontmatter?.aliases).toEqual(["solitude"]);
  });
});

describe("note.toFile", () => {
  const note: Note = {
    uuid: "note-0001-0000-0000-000000000001",
    key: "bridge observation",
    content: "The bridge detail might be too literal.",
  };

  it("writes uuid to frontmatter", () => {
    const { frontmatter } = toFile(note);
    expect(frontmatter.uuid as string).toBe(note.uuid as string);
  });

  it("writes content to body", () => {
    const { body } = toFile(note);
    expect(body).toBe("The bridge detail might be too literal.");
  });

  it("round-trips unmanaged keys, managed uuid winning on clash", () => {
    const parsed: ParsedFile = {
      frontmatter: { uuid: "note-0001-0000-0000-000000000001", tags: ["wip"] },
      inlineFields: {},
      body: "body",
    };
    const { frontmatter } = toFile(fromFile(parsed, "bridge.md"));
    expect(frontmatter.tags).toEqual(["wip"]);
    expect(frontmatter.uuid).toBe("note-0001-0000-0000-000000000001");
  });
});
