import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/fragment";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Fragment } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "frag-0001-0000-0000-000000000001",
    title: "The Bridge",
    version: 3,
    readyStatus: 0.8,
    notes: ["bridge observation"],
    references: ["city research"],
  },
  inlineFields: { grief: "0.6", city: "0.9" },
  body: "She crossed it every morning without looking down.",
};

describe("fragment.fromFile", () => {
  it("maps all frontmatter fields", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.uuid as string).toBe("frag-0001-0000-0000-000000000001");
    expect(fragment.title).toBe("The Bridge");
    expect(fragment.version).toBe(3);
    expect(fragment.isDiscarded).toBe(false);
    expect(fragment.readyStatus).toBe(0.8);
    expect(fragment.notes).toEqual(["bridge observation"]);
    expect(fragment.references).toEqual(["city research"]);
  });

  it("maps inline fields to properties", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.properties["grief"]).toEqual({ weight: 0.6 });
    expect(fragment.properties["city"]).toEqual({ weight: 0.9 });
  });

  it("maps body to content", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.content).toContain("She crossed it every morning");
  });

  it("derives isDiscarded=true for files in discarded/", () => {
    const fragment = fromFile(PARSED, "discarded/the-bridge.md");
    expect(fragment.isDiscarded).toBe(true);
  });

  it("derives title from filename when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, title: undefined },
    };
    const fragment = fromFile(parsed, "fragments/the-bridge.md");
    expect(fragment.title).toBe("the-bridge");
  });

  it("defaults version to 1 when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, version: undefined },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    expect(fragment.version).toBe(1);
  });

  it("defaults readyStatus to 0 when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, readyStatus: undefined },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    expect(fragment.readyStatus).toBe(0);
  });

  it("defaults notes and references to empty arrays", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, notes: undefined, references: undefined },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    expect(fragment.notes).toEqual([]);
    expect(fragment.references).toEqual([]);
  });
});

describe("fragment.toFile", () => {
  const fragment: Fragment = {
    uuid: "frag-0001-0000-0000-000000000001",
    title: "The Bridge",
    version: 3,
    isDiscarded: false,
    readyStatus: 0.8,
    notes: ["bridge observation"],
    references: ["city research"],
    properties: { grief: { weight: 0.6 }, city: { weight: 0.9 } },
    content: "She crossed it every morning.",
    contentHash: "abc123",
    updatedAt: new Date(),
  };

  it("writes all frontmatter fields", () => {
    const { frontmatter } = toFile(fragment);
    expect(frontmatter.uuid).toBe(fragment.uuid);
    expect(frontmatter.title).toBe("The Bridge");
    expect(frontmatter.version).toBe(3);
    expect(frontmatter.readyStatus).toBe(0.8);
  });

  it("does not write pool, contentHash, or updatedAt", () => {
    const { frontmatter } = toFile(fragment);
    expect("pool" in frontmatter).toBe(false);
    expect("contentHash" in frontmatter).toBe(false);
    expect("updatedAt" in frontmatter).toBe(false);
    expect("isDiscarded" in frontmatter).toBe(false);
  });

  it("writes properties as inline fields", () => {
    const { inlineFields } = toFile(fragment);
    expect(inlineFields["grief"]).toBe(0.6);
    expect(inlineFields["city"]).toBe(0.9);
  });

  it("writes content as body", () => {
    const { body } = toFile(fragment);
    expect(body).toBe("She crossed it every morning.");
  });
});
