import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/fragment";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Fragment } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "frag-0001-0000-0000-000000000001",
    updatedAt: "2026-04-01T12:00:00.000Z",
    readiness: 0.8,
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
    expect(fragment.readiness).toBe(0.8);
    expect(fragment.references).toEqual(["city research"]);
  });

  it("captures unmanaged frontmatter keys into extraFrontmatter (no legacy notes)", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: {
        ...PARSED.frontmatter,
        // A legacy fragment notes attachment plus a user-authored Obsidian key.
        notes: ["bridge observation"],
        tags: ["wip", "draft"],
      },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    // The removed notes attachment is not surfaced and is not preserved as user data.
    expect("notes" in fragment).toBe(false);
    expect(fragment.extraFrontmatter?.notes).toBeUndefined();
    // Genuinely unmanaged keys are preserved.
    expect(fragment.extraFrontmatter?.tags).toEqual(["wip", "draft"]);
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

  it("maps inline fields to aspects", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.aspects["grief"]).toEqual({ weight: 0.6 });
    expect(fragment.aspects["city"]).toEqual({ weight: 0.9 });
  });

  it("maps body to content", () => {
    const fragment = fromFile(PARSED, "the-bridge.md");
    expect(fragment.content).toContain("She crossed it every morning");
  });

  it("derives isDiscarded=true for files in discarded/", () => {
    const fragment = fromFile(PARSED, "discarded/the-bridge.md");
    expect(fragment.isDiscarded).toBe(true);
  });

  it("defaults readiness to 0 when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, readiness: undefined },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    expect(fragment.readiness).toBe(0);
  });

  it("defaults references to an empty array", () => {
    const parsed: ParsedFile = {
      ...PARSED,
      frontmatter: { ...PARSED.frontmatter, references: undefined },
    };
    const fragment = fromFile(parsed, "the-bridge.md");
    expect(fragment.references).toEqual([]);
  });
});

describe("fragment.toFile", () => {
  const updatedAt = new Date("2026-04-01T12:00:00.000Z");
  const fragment: Fragment = {
    uuid: "frag-0001-0000-0000-000000000001",
    key: "the-bridge",
    isDiscarded: false,
    readiness: 0.8,
    references: ["city research"],
    aspects: { grief: { weight: 0.6 }, city: { weight: 0.9 } },
    content: "She crossed it every morning.",
    contentHash: "abc123",
    updatedAt,
    extraFrontmatter: { tags: ["wip"] },
  };

  it("writes all frontmatter fields", () => {
    const { frontmatter } = toFile(fragment);
    expect(frontmatter.uuid).toBe(fragment.uuid);
    expect(frontmatter.updatedAt).toBe("2026-04-01T12:00:00.000Z");
    expect(frontmatter.readiness).toBe(0.8);
  });

  it("does not write a notes attachment, contentHash, or isDiscarded", () => {
    const { frontmatter } = toFile(fragment);
    expect("notes" in frontmatter).toBe(false);
    expect("contentHash" in frontmatter).toBe(false);
    expect("isDiscarded" in frontmatter).toBe(false);
  });

  it("preserves unmanaged frontmatter keys (does not strip user data)", () => {
    const { frontmatter } = toFile(fragment);
    expect(frontmatter.tags).toEqual(["wip"]);
  });

  it("writes aspects as inline fields", () => {
    const { inlineFields } = toFile(fragment);
    expect(inlineFields["grief"]).toBe(0.6);
    expect(inlineFields["city"]).toBe(0.9);
  });

  it("writes content as body", () => {
    const { body } = toFile(fragment);
    expect(body).toBe("She crossed it every morning.");
  });
});
