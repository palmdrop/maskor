import { describe, it, expect } from "bun:test";
import { parseFile } from "../vault/markdown/parse";

const FULL_FILE = `---
uuid: "frag-0001"
title: "The Bridge"
version: 3
customField: some-value
readyStatus: 0.8
notes:
  - "bridge observation"
references: []
---

grief:: 0.6
city:: 0.9

She crossed it every morning without looking down.
`;

describe("parseFile", () => {
  it("extracts frontmatter", () => {
    const result = parseFile(FULL_FILE);
    expect(result.frontmatter.uuid).toBe("frag-0001");
    expect(result.frontmatter.title).toBe("The Bridge");
    expect(result.frontmatter.version).toBe(3);
    expect(result.frontmatter.customField).toBe("some-value");
    expect(result.frontmatter.readyStatus).toBe(0.8);
  });

  it("extracts inline fields", () => {
    const result = parseFile(FULL_FILE);
    expect(result.inlineFields["grief"]).toBe("0.6");
    expect(result.inlineFields["city"]).toBe("0.9");
  });

  it("extracts body text", () => {
    const result = parseFile(FULL_FILE);
    expect(result.body).toContain("She crossed it every morning");
  });

  it("body does not include inline fields", () => {
    const result = parseFile(FULL_FILE);
    expect(result.body).not.toContain("grief::");
  });

  it("handles file with no inline fields", () => {
    const file = `---
uuid: "frag-0002"
title: "Late Winter"
---

Just the body here.
`;
    const result = parseFile(file);
    expect(result.inlineFields).toEqual({});
    expect(result.body).toContain("Just the body here.");
  });

  it("handles file with no body", () => {
    const file = `---
uuid: "aspect-0001"
key: "grief"
---
`;
    const result = parseFile(file);
    expect(result.body).toBe("");
    expect(result.inlineFields).toEqual({});
  });

  it("handles file with no frontmatter", () => {
    const file = `Just raw content with no frontmatter.`;
    const result = parseFile(file);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toContain("Just raw content");
  });

  it("stops collecting inline fields at first non-matching line", () => {
    const file = `---
title: "Test"
---

grief:: 0.5

This is the body, not an inline field.
another-key:: 0.3
`;
    const result = parseFile(file);
    expect(result.inlineFields["grief"]).toBe("0.5");
    expect(result.inlineFields["another-key"]).toBeUndefined();
    expect(result.body).toContain("This is the body");
    expect(result.body).toContain("another-key:: 0.3");
  });
});
