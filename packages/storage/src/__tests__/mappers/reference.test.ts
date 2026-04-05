import { describe, it, expect } from "bun:test";
import { fromFile, toFile } from "../../vault/markdown/mappers/reference";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Reference, ReferenceUUID } from "@maskor/shared";

const PARSED: ParsedFile = {
  frontmatter: {
    uuid: "ref-00001-0000-0000-000000000001",
    name: "city research",
  },
  inlineFields: {},
  body: "Notes on urban waterways.",
};

describe("reference.fromFile", () => {
  it("maps uuid, name, content", () => {
    const ref = fromFile(PARSED, "references/city-research.md");
    expect(ref.uuid as string).toBe("ref-00001-0000-0000-000000000001");
    expect(ref.name).toBe("city research");
    expect(ref.content).toBe("Notes on urban waterways.");
  });

  it("derives name from filename when missing", () => {
    const parsed: ParsedFile = { ...PARSED, frontmatter: { uuid: "ref-0001" } };
    const ref = fromFile(parsed, "references/city-research.md");
    expect(ref.name).toBe("city-research");
  });
});

describe("reference.toFile", () => {
  const ref: Reference = {
    uuid: "ref-00001-0000-0000-000000000001" as ReferenceUUID,
    name: "city research",
    content: "Notes on urban waterways.",
  };

  it("writes uuid and name to frontmatter", () => {
    const { frontmatter } = toFile(ref);
    expect(frontmatter.uuid as string).toBe(ref.uuid as string);
    expect(frontmatter.name).toBe("city research");
  });

  it("writes content to body", () => {
    const { body } = toFile(ref);
    expect(body).toBe("Notes on urban waterways.");
  });
});
