import { describe, it, expect } from "bun:test";
import {
  fromFile,
  toFile,
  inlineFieldsToProperties,
  propertiesToInlineFields,
} from "../../vault/markdown/mappers/aspect";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Aspect } from "@maskor/shared";

const PARSED_ASPECT: ParsedFile = {
  frontmatter: {
    uuid: "aspect-0001-0000-0000-000000000001",
    key: "grief",
    category: "theme",
    notes: [],
  },
  inlineFields: {},
  body: "The presence of loss — ambient, not dramatic.",
};

describe("aspect.fromFile", () => {
  it("maps all frontmatter fields", () => {
    const aspect = fromFile(PARSED_ASPECT);
    expect(aspect.uuid as string).toBe("aspect-0001-0000-0000-000000000001");
    expect(aspect.key).toBe("grief");
    expect(aspect.category).toBe("theme");
    expect(aspect.notes).toEqual([]);
  });

  it("maps body to description", () => {
    const aspect = fromFile(PARSED_ASPECT);
    expect(aspect.description).toBe("The presence of loss — ambient, not dramatic.");
  });

  it("sets description to undefined when body is empty", () => {
    const aspect = fromFile({ ...PARSED_ASPECT, body: "" });
    expect(aspect.description).toBeUndefined();
  });

  it("sets category to undefined when missing", () => {
    const parsed: ParsedFile = {
      ...PARSED_ASPECT,
      frontmatter: { ...PARSED_ASPECT.frontmatter, category: undefined },
    };
    const aspect = fromFile(parsed);
    expect(aspect.category).toBeUndefined();
  });
});

describe("aspect.toFile", () => {
  const aspect: Aspect = {
    uuid: "aspect-0001-0000-0000-000000000001",
    key: "grief",
    category: "theme",
    description: "The presence of loss.",
    notes: [],
  };

  it("writes uuid, key, notes to frontmatter", () => {
    const { frontmatter } = toFile(aspect);
    expect(frontmatter.uuid).toBe(aspect.uuid);
    expect(frontmatter.key).toBe("grief");
    expect(frontmatter.notes).toEqual([]);
  });

  it("writes category when present", () => {
    const { frontmatter } = toFile(aspect);
    expect(frontmatter.category).toBe("theme");
  });

  it("omits category when undefined", () => {
    const { frontmatter } = toFile({ ...aspect, category: undefined });
    expect("category" in frontmatter).toBe(false);
  });

  it("writes description to body", () => {
    const { body } = toFile(aspect);
    expect(body).toBe("The presence of loss.");
  });

  it("writes empty body when description is undefined", () => {
    const { body } = toFile({ ...aspect, description: undefined });
    expect(body).toBe("");
  });
});

describe("inlineFieldsToProperties", () => {
  it("converts inline fields to FragmentProperties", () => {
    const props = inlineFieldsToProperties({ grief: "0.6", city: "0.9" });
    expect(props["grief"]).toEqual({ weight: 0.6 });
    expect(props["city"]).toEqual({ weight: 0.9 });
  });

  it("skips non-numeric values", () => {
    const props = inlineFieldsToProperties({ grief: "0.6", bad: "notanumber" });
    expect(props["grief"]).toEqual({ weight: 0.6 });
    expect(props["bad"]).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    expect(inlineFieldsToProperties({})).toEqual({});
  });
});

describe("propertiesToInlineFields", () => {
  it("converts FragmentProperties to inline fields", () => {
    const fields = propertiesToInlineFields({ grief: { weight: 0.6 }, city: { weight: 0.9 } });
    expect(fields["grief"]).toBe(0.6);
    expect(fields["city"]).toBe(0.9);
  });

  it("returns empty object for empty properties", () => {
    expect(propertiesToInlineFields({})).toEqual({});
  });
});
