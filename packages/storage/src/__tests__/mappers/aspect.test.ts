import { describe, it, expect } from "bun:test";
import {
  fromFile,
  toFile,
  inlineFieldsToAspects,
  aspectsToInlineFields,
} from "../../vault/markdown/mappers/aspect";
import type { ParsedFile } from "../../vault/markdown/parse";
import type { Aspect } from "@maskor/shared";

const PARSED_ASPECT: ParsedFile = {
  frontmatter: {
    uuid: "aspect-0001-0000-0000-000000000001",
    notes: [],
  },
  inlineFields: {},
  body: "The presence of loss — ambient, not dramatic.",
};

describe("aspect.fromFile", () => {
  it("derives key from filename stem", () => {
    const aspect = fromFile(PARSED_ASPECT, "grief.md");
    expect(aspect.uuid as string).toBe("aspect-0001-0000-0000-000000000001");
    expect(aspect.key).toBe("grief");
    expect(aspect.notes).toEqual([]);
  });

  it("maps body to description", () => {
    const aspect = fromFile(PARSED_ASPECT, "grief.md");
    expect(aspect.description).toBe("The presence of loss — ambient, not dramatic.");
  });

  it("sets description to undefined when body is empty", () => {
    const aspect = fromFile({ ...PARSED_ASPECT, body: "" }, "grief.md");
    expect(aspect.description).toBeUndefined();
  });

  it("derives category as undefined at the entity-type root", () => {
    const aspect = fromFile(PARSED_ASPECT, "grief.md");
    expect(aspect.category).toBeUndefined();
  });

  it("derives category from single-level subfolder", () => {
    const aspect = fromFile(PARSED_ASPECT, "themes/grief.md");
    expect(aspect.category).toBe("themes");
  });

  it("derives category from nested subfolders", () => {
    const aspect = fromFile(PARSED_ASPECT, "world/places/london.md");
    expect(aspect.category).toBe("world/places");
  });

  it("reads color from frontmatter when present", () => {
    const parsed: ParsedFile = {
      ...PARSED_ASPECT,
      frontmatter: { ...PARSED_ASPECT.frontmatter, color: "#f97316" },
    };
    const aspect = fromFile(parsed, "grief.md");
    expect(aspect.color).toBe("#f97316");
  });

  it("sets color to undefined when missing from frontmatter", () => {
    const aspect = fromFile(PARSED_ASPECT, "grief.md");
    expect(aspect.color).toBeUndefined();
  });

  it("captures unmanaged frontmatter keys into extraFrontmatter (managed keys excluded)", () => {
    const parsed: ParsedFile = {
      ...PARSED_ASPECT,
      frontmatter: {
        ...PARSED_ASPECT.frontmatter,
        color: "#f97316",
        notes: ["a note key"],
        tags: ["theme"],
        aliases: ["sorrow"],
      },
    };
    const aspect = fromFile(parsed, "grief.md");
    // Managed keys are not duplicated into extraFrontmatter.
    expect(aspect.extraFrontmatter?.uuid).toBeUndefined();
    expect(aspect.extraFrontmatter?.color).toBeUndefined();
    expect(aspect.extraFrontmatter?.notes).toBeUndefined();
    // Unmanaged user keys are preserved; the managed notes list is still mapped normally.
    expect(aspect.extraFrontmatter?.tags).toEqual(["theme"]);
    expect(aspect.extraFrontmatter?.aliases).toEqual(["sorrow"]);
    expect(aspect.notes).toEqual(["a note key"]);
  });
});

describe("aspect.toFile", () => {
  const aspect: Aspect = {
    uuid: "aspect-0001-0000-0000-000000000001",
    key: "grief",
    category: "themes",
    description: "The presence of loss.",
    notes: [],
  };

  it("writes uuid and notes to frontmatter", () => {
    const { frontmatter } = toFile(aspect);
    expect(frontmatter.uuid).toBe(aspect.uuid);
    expect(frontmatter.notes).toEqual([]);
  });

  it("does not write category to frontmatter — category is derived from path", () => {
    const { frontmatter } = toFile(aspect);
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

  it("writes color to frontmatter when present", () => {
    const { frontmatter } = toFile({ ...aspect, color: "#22c55e" });
    expect(frontmatter.color).toBe("#22c55e");
  });

  it("omits color when undefined", () => {
    const { frontmatter } = toFile(aspect);
    expect("color" in frontmatter).toBe(false);
  });

  it("re-emits unmanaged frontmatter keys, managed keys winning on clash", () => {
    const { frontmatter } = toFile({
      ...aspect,
      extraFrontmatter: { tags: ["theme"], uuid: "should-be-overwritten" },
    });
    expect(frontmatter.tags).toEqual(["theme"]);
    // Managed uuid wins over an extraFrontmatter clash.
    expect(frontmatter.uuid).toBe(aspect.uuid);
  });

  it("round-trips unmanaged keys through fromFile → toFile", () => {
    const parsed: ParsedFile = {
      frontmatter: {
        uuid: "aspect-0001-0000-0000-000000000001",
        notes: ["n"],
        tags: ["theme"],
      },
      inlineFields: {},
      body: "desc",
    };
    const { frontmatter } = toFile(fromFile(parsed, "themes/grief.md"));
    expect(frontmatter.tags).toEqual(["theme"]);
    expect(frontmatter.notes).toEqual(["n"]);
  });
});

describe("inlineFieldsToAspects", () => {
  it("converts inline fields to AspectWeights", () => {
    const aspects = inlineFieldsToAspects({ grief: "0.6", city: "0.9" });
    expect(aspects["grief"]).toEqual({ weight: 0.6 });
    expect(aspects["city"]).toEqual({ weight: 0.9 });
  });

  it("skips non-numeric values", () => {
    const aspects = inlineFieldsToAspects({ grief: "0.6", bad: "notanumber" });
    expect(aspects["grief"]).toEqual({ weight: 0.6 });
    expect(aspects["bad"]).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    expect(inlineFieldsToAspects({})).toEqual({});
  });
});

describe("aspectsToInlineFields", () => {
  it("converts AspectWeights to inline fields", () => {
    const fields = aspectsToInlineFields({ grief: { weight: 0.6 }, city: { weight: 0.9 } });
    expect(fields["grief"]).toBe(0.6);
    expect(fields["city"]).toBe(0.9);
  });

  it("returns empty object for empty aspects", () => {
    expect(aspectsToInlineFields({})).toEqual({});
  });
});
