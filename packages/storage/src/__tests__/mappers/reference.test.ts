import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/reference";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Reference } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "ref-00001-0000-0000-000000000001",
  },
  inlineFields: {},
  body: "Notes on urban waterways.",
};

describe("reference.fromFile", () => {
  it("derives key from filename stem", () => {
    const ref = fromFile(PARSED, "city research.md");
    expect(ref.uuid as string).toBe("ref-00001-0000-0000-000000000001");
    expect(ref.key).toBe("city research");
    expect(ref.content).toBe("Notes on urban waterways.");
  });

  it("strips .md extension from key", () => {
    const ref = fromFile(PARSED, "references/city-research.md");
    expect(ref.key).toBe("city-research");
  });
});

describe("reference.toFile", () => {
  const ref: Reference = {
    uuid: "ref-00001-0000-0000-000000000001",
    key: "city research",
    content: "Notes on urban waterways.",
  };

  it("writes uuid to frontmatter", () => {
    const { frontmatter } = toFile(ref);
    expect(frontmatter.uuid as string).toBe(ref.uuid as string);
  });

  it("writes content to body", () => {
    const { body } = toFile(ref);
    expect(body).toBe("Notes on urban waterways.");
  });
});
