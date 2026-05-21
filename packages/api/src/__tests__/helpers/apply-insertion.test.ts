import { describe, it, expect } from "bun:test";
import { applyInsertion } from "../../helpers/apply-insertion";

describe("applyInsertion", () => {
  describe("append", () => {
    it("appends with blank-line separator", () => {
      expect(applyInsertion("Existing body.", "New text.", "append")).toBe(
        "Existing body.\n\nNew text.",
      );
    });

    it("trims trailing whitespace from existing body before separator", () => {
      expect(applyInsertion("Existing body.   \n", "New text.", "append")).toBe(
        "Existing body.\n\nNew text.",
      );
    });

    it("returns inserted text verbatim when existing body is empty", () => {
      expect(applyInsertion("", "New text.", "append")).toBe("New text.");
    });

    it("returns inserted text verbatim when existing body is whitespace-only", () => {
      expect(applyInsertion("   \n  ", "New text.", "append")).toBe("New text.");
    });
  });

  describe("prepend", () => {
    it("prepends with blank-line separator", () => {
      expect(applyInsertion("Existing body.", "New text.", "prepend")).toBe(
        "New text.\n\nExisting body.",
      );
    });

    it("trims leading whitespace from existing body before separator", () => {
      expect(applyInsertion("\n  Existing body.", "New text.", "prepend")).toBe(
        "New text.\n\nExisting body.",
      );
    });

    it("returns inserted text verbatim when existing body is empty", () => {
      expect(applyInsertion("", "New text.", "prepend")).toBe("New text.");
    });

    it("returns inserted text verbatim when existing body is whitespace-only", () => {
      expect(applyInsertion("   \n  ", "New text.", "prepend")).toBe("New text.");
    });
  });

  it("preserves multi-line inserted text", () => {
    expect(applyInsertion("Body.", "Line one.\nLine two.", "append")).toBe(
      "Body.\n\nLine one.\nLine two.",
    );
  });
});
