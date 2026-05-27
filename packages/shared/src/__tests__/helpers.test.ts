import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { deepPartial, withDefaults } from "../schemas/helpers";

const PersonSchema = z.object({
  name: z.string(),
  address: z.object({
    city: z.string(),
    zip: z.string(),
  }),
  age: z.number(),
});

describe("deepPartial", () => {
  it("makes all top-level fields optional", () => {
    const partial = deepPartial(PersonSchema);
    expect(partial.parse({})).toEqual({});
    expect(partial.parse({ name: "Alice" })).toEqual({ name: "Alice" });
  });

  it("makes nested object fields optional", () => {
    const partial = deepPartial(PersonSchema);
    // Cast to unknown: deepPartial's inferred type doesn't track recursive depth,
    // but the runtime schema does make nested fields optional.
    const withCity = partial.parse({ address: { city: "NYC" } }) as unknown;
    expect(withCity).toEqual({ address: { city: "NYC" } });
    const empty = partial.parse({ address: {} }) as unknown;
    expect(empty).toEqual({ address: {} });
  });

  it("preserves field values when provided", () => {
    const partial = deepPartial(PersonSchema);
    const result = partial.parse({ name: "Alice", address: { city: "NYC", zip: "10001" }, age: 30 });
    expect(result as unknown).toEqual({ name: "Alice", address: { city: "NYC", zip: "10001" }, age: 30 });
  });

  it("rejects wrong types", () => {
    const partial = deepPartial(PersonSchema);
    expect(() => partial.parse({ age: "not-a-number" })).toThrow();
  });
});

describe("withDefaults", () => {
  const ConfigSchema = z.object({
    fontSize: z.number(),
    vimMode: z.boolean(),
    theme: z.string(),
  });

  const defaults = { fontSize: 16, vimMode: false, theme: "light" };
  const parser = withDefaults(ConfigSchema, defaults);

  it("applies defaults for missing fields", () => {
    expect(parser.parse({})).toEqual({ fontSize: 16, vimMode: false, theme: "light" });
  });

  it("user-provided values override defaults", () => {
    expect(parser.parse({ fontSize: 20, vimMode: true })).toEqual({
      fontSize: 20,
      vimMode: true,
      theme: "light",
    });
  });

  it("full input passes through unchanged", () => {
    const input = { fontSize: 14, vimMode: true, theme: "dark" };
    expect(parser.parse(input)).toEqual(input);
  });

  it("safeParse returns success with defaults applied", () => {
    const result = parser.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ fontSize: 16, vimMode: false, theme: "light" });
    }
  });

  it("safeParse returns failure for wrong types", () => {
    const result = parser.safeParse({ fontSize: "not-a-number" });
    expect(result.success).toBe(false);
  });
});
