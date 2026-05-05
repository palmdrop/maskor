import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/fragment";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Fragment } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "frag-0001-0000-0000-000000000001",
    updatedAt: "2026-04-01T12:00:00.000Z",
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
    expect(fragment.key).toBe("the-bridge");
    expect(fragment.isDiscarded).toBe(false);
    expect(fragment.readyStatus).toBe(0.8);
    expect(fragment.notes).toEqual(["bridge observation"]);
    expect(fragment.references).toEqual(["city research"]);
  });

  it("reads updatedAt from frontmatter", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.updatedAt).toEqual(new Date("2026-04-01T12:00:00.000Z"));
  });

  it("defaults updatedAt to now when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, updatedAt: undefined },
    };
    const before = new Date();
    const fragment = fromFile(parsed, "the-bridge.md");
    const after = new Date();
    expect(fragment.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(fragment.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
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
  const updatedAt = new Date("2026-04-01T12:00:00.000Z");
  const fragment: Fragment = {
    uuid: "frag-0001-0000-0000-000000000001",
    key: "the-bridge",
    isDiscarded: false,
    readyStatus: 0.8,
    notes: ["bridge observation"],
    references: ["city research"],
    properties: { grief: { weight: 0.6 }, city: { weight: 0.9 } },
    content: "She crossed it every morning.",
    contentHash: "abc123",
    updatedAt,
  };

  it("writes all frontmatter fields", () => {
    const { frontmatter } = toFile(fragment);
    expect(frontmatter.uuid).toBe(fragment.uuid);
    expect(frontmatter.updatedAt).toBe("2026-04-01T12:00:00.000Z");
    expect(frontmatter.readyStatus).toBe(0.8);
  });

  it("does not write contentHash or isDiscarded", () => {
    const { frontmatter } = toFile(fragment);
    expect("contentHash" in frontmatter).toBe(false);
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
