import { describe, it, expect } from "bun:test";

describe("@maskor/importer", () => {
  it("splits plain text into non-empty lines", () => {
    // Dummy: replace with real importer/parser tests once parsing logic exists
    const raw = "Fragment one.\n\nFragment two.\n\nFragment three.";
    const paragraphs = raw.split("\n\n").filter(Boolean);
    expect(paragraphs).toHaveLength(3);
  });

  it("strips leading and trailing whitespace from each paragraph", () => {
    const paragraphs = ["  hello  ", " world "];
    expect(paragraphs.map((p) => p.trim())).toEqual(["hello", "world"]);
  });
});
