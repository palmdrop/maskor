import { describe, expect, it } from "vitest";
import { isTrailingWhitespaceEquivalent } from "./buffer-sync";

describe("isTrailingWhitespaceEquivalent", () => {
  it("treats a trailing-newline-only difference as equivalent (the save round-trip case)", () => {
    // The vault re-emits the body as `body.trim() + "\n"`, so the server form gains a trailing
    // newline the live buffer never had — this must not count as a change.
    expect(isTrailingWhitespaceEquivalent("a paragraph", "a paragraph\n")).toBe(true);
    expect(isTrailingWhitespaceEquivalent("a paragraph\n", "a paragraph")).toBe(true);
  });

  it("treats trailing spaces/tabs/newlines as equivalent", () => {
    expect(isTrailingWhitespaceEquivalent("line  \n\n", "line\n")).toBe(true);
  });

  it("treats identical content as equivalent", () => {
    expect(isTrailingWhitespaceEquivalent("same\n\nblocks", "same\n\nblocks")).toBe(true);
  });

  it("treats a real edit as a genuine change", () => {
    expect(isTrailingWhitespaceEquivalent("first", "first edited")).toBe(false);
  });

  it("does not absorb a leading-whitespace difference (offsets would shift)", () => {
    expect(isTrailingWhitespaceEquivalent("\n\nbody", "body")).toBe(false);
  });

  it("treats interior whitespace as significant", () => {
    expect(isTrailingWhitespaceEquivalent("a\n\nb", "a\nb")).toBe(false);
  });
});
