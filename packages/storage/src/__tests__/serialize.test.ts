import { describe, it, expect } from "bun:test";
import { serializeFile } from "../vault/markdown/serialize";
import { parseFile } from "../vault/markdown/parse";

describe("serializeFile", () => {
  it("produces valid frontmatter", () => {
    const result = serializeFile({
      frontmatter: { uuid: "frag-0001", title: "The Bridge", pool: "unplaced" },
      body: "Body text.",
    });
    const parsed = parseFile(result);
    expect(parsed.frontmatter.uuid).toBe("frag-0001");
    expect(parsed.frontmatter.title).toBe("The Bridge");
    expect(parsed.frontmatter.pool).toBe("unplaced");
  });

  it("writes inline fields between frontmatter and body", () => {
    const result = serializeFile({
      frontmatter: { uuid: "frag-0001" },
      inlineFields: { grief: 0.6, city: 0.9 },
      body: "Body text.",
    });
    const parsed = parseFile(result);
    expect(parsed.inlineFields["grief"]).toBe("0.6");
    expect(parsed.inlineFields["city"]).toBe("0.9");
    expect(parsed.body).toContain("Body text.");
  });

  it("omits inline fields section when none provided", () => {
    const result = serializeFile({
      frontmatter: { uuid: "frag-0001" },
      body: "Body text.",
    });
    expect(result).not.toContain("::");
    expect(result).toContain("Body text.");
  });

  it("omits body section when body is empty", () => {
    const result = serializeFile({
      frontmatter: { uuid: "aspect-0001", key: "grief" },
      body: "",
    });
    const parsed = parseFile(result);
    expect(parsed.body).toBe("");
    expect(parsed.frontmatter.key).toBe("grief");
  });

  it("round-trips correctly through parseFile", () => {
    const original = {
      frontmatter: { uuid: "frag-0001", title: "The Bridge", version: 3, readyStatus: 0.8 },
      inlineFields: { grief: 0.6, city: 0.9 },
      body: "She crossed it every morning without looking down.",
    };
    const serialized = serializeFile(original);
    const parsed = parseFile(serialized);

    expect(parsed.frontmatter.uuid).toBe("frag-0001");
    expect(parsed.frontmatter.version).toBe(3);
    expect(parsed.inlineFields["grief"]).toBe("0.6");
    expect(parsed.body).toContain("She crossed it every morning");
  });

  it("ends with a newline", () => {
    const result = serializeFile({ frontmatter: { uuid: "x" }, body: "" });
    expect(result.endsWith("\n")).toBe(true);
  });
});
