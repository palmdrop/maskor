import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/note";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Note, NoteUUID } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "note-0001-0000-0000-000000000001",
    title: "bridge observation",
  },
  inlineFields: {},
  body: "The bridge detail might be too literal.",
};

describe("note.fromFile", () => {
  it("maps uuid, title, content", () => {
    const note = fromFile(PARSED, "notes/bridge-observation.md");
    expect(note.uuid as string).toBe("note-0001-0000-0000-000000000001");
    expect(note.title).toBe("bridge observation");
    expect(note.content).toBe("The bridge detail might be too literal.");
  });

  it("derives title from filename when missing", () => {
    const parsed: ParsedFile = { ...PARSED, frontmatter: { uuid: "note-0001" } };
    const note = fromFile(parsed, "notes/bridge-observation.md");
    expect(note.title).toBe("bridge-observation");
  });
});

describe("note.toFile", () => {
  const note: Note = {
    uuid: "note-0001-0000-0000-000000000001" as NoteUUID,
    title: "bridge observation",
    content: "The bridge detail might be too literal.",
  };

  it("writes uuid and title to frontmatter", () => {
    const { frontmatter } = toFile(note);
    expect(frontmatter.uuid as string).toBe(note.uuid as string);
    expect(frontmatter.title).toBe("bridge observation");
  });

  it("writes content to body", () => {
    const { body } = toFile(note);
    expect(body).toBe("The bridge detail might be too literal.");
  });
});
