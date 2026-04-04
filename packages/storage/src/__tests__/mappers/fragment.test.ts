import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../backend/markdown/mappers/fragment";
import type { ParsedFile } from "../../backend/markdown/parse";
import type { Fragment, FragmentUUID } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "frag-0001-0000-0000-000000000001",
    title: "The Bridge",
    version: 3,
    pool: "unplaced",
    readyStatus: 0.8,
    notes: ["bridge observation"],
    references: ["city research"],
  },
  inlineFields: { grief: "0.6", city: "0.9" },
  body: "She crossed it every morning without looking down.",
};

describe("fragment.fromFile", () => {
  it("maps all frontmatter fields", () => {
    const f = fromFile(PARSED, "fragments/the-bridge.md");
    expect(f.uuid as string).toBe("frag-0001-0000-0000-000000000001");
    expect(f.title).toBe("The Bridge");
    expect(f.version).toBe(3);
    expect(f.pool).toBe("unplaced");
    expect(f.readyStatus).toBe(0.8);
    expect(f.notes).toEqual(["bridge observation"]);
    expect(f.references).toEqual(["city research"]);
  });

  it("maps inline fields to properties", () => {
    const f = fromFile(PARSED, "fragments/the-bridge.md");
    expect(f.properties["grief"]).toEqual({ weight: 0.6 });
    expect(f.properties["city"]).toEqual({ weight: 0.9 });
  });

  it("maps body to content", () => {
    const f = fromFile(PARSED, "fragments/the-bridge.md");
    expect(f.content).toContain("She crossed it every morning");
  });

  it("pool override takes precedence over frontmatter", () => {
    const f = fromFile(PARSED, "fragments/the-bridge.md", "discarded");
    expect(f.pool).toBe("discarded");
  });

  it("derives title from filename when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, title: undefined },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.title).toBe("the-bridge");
  });

  it("defaults version to 1 when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, version: undefined },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.version).toBe(1);
  });

  it("defaults readyStatus to 0 when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, readyStatus: undefined },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.readyStatus).toBe(0);
  });

  it("defaults pool to incomplete when required fields are missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { uuid: "frag-0001" },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.pool).toBe("incomplete");
  });

  it("defaults pool to unplaced when all required fields present", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, pool: undefined },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.pool).toBe("unplaced");
  });

  it("defaults notes and references to empty arrays", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, notes: undefined, references: undefined },
    };
    const f = fromFile(parsed, "fragments/the-bridge.md");
    expect(f.notes).toEqual([]);
    expect(f.references).toEqual([]);
  });
});

describe("fragment.toFile", () => {
  const fragment: Fragment = {
    uuid: "frag-0001-0000-0000-000000000001" as FragmentUUID,
    title: "The Bridge",
    version: 3,
    pool: "unplaced",
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
    expect(frontmatter.pool).toBe("unplaced");
    expect(frontmatter.readyStatus).toBe(0.8);
  });

  it("does not write contentHash or updatedAt", () => {
    const { frontmatter } = toFile(fragment);
    expect("contentHash" in frontmatter).toBe(false);
    expect("updatedAt" in frontmatter).toBe(false);
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
