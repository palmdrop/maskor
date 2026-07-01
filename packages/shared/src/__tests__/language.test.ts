import { describe, it, expect } from "bun:test";
import { resolveLanguage, LANGUAGE_INHERIT } from "../schemas/domain/language";

describe("resolveLanguage", () => {
  it("uses the fragment override when present", () => {
    expect(resolveLanguage("sv", "en-US")).toBe("sv");
  });

  it("falls back to the project language when the fragment has no override", () => {
    expect(resolveLanguage(undefined, "en-US")).toBe("en-US");
  });

  it("treats the empty-string override as a meaningful opt-out (browser default)", () => {
    // A fragment can explicitly clear back to the browser default even when the project sets a language.
    expect(resolveLanguage(LANGUAGE_INHERIT, "sv")).toBe(LANGUAGE_INHERIT);
  });

  it("resolves to browser default when neither sets a language", () => {
    expect(resolveLanguage(undefined, LANGUAGE_INHERIT)).toBe(LANGUAGE_INHERIT);
  });
});
