import { describe, it, expect } from "vitest";
import { anchorSentinel } from "@maskor/shared/sentinel";
import { splitAroundFragment } from "../split-around-fragment";

const sent = anchorSentinel;

describe("splitAroundFragment", () => {
  it("returns null when the sentinel for the uuid is not present", () => {
    const markdown = "# Title\n\nSome content.";
    expect(splitAroundFragment(markdown, "missing-uuid")).toBeNull();
  });

  it("splits correctly when the fragment is in the middle", () => {
    const markdown = [
      "## Chapter One",
      "",
      sent("frag-1"),
      "First fragment body.",
      "",
      sent("frag-2"),
      "Second fragment body.",
      "",
      sent("frag-3"),
      "Third fragment body.",
    ].join("\n");

    const result = splitAroundFragment(markdown, "frag-2");
    expect(result).not.toBeNull();

    // Before ends just before the frag-2 sentinel (frag-1 content included).
    expect(result!.before).toContain("First fragment body.");
    expect(result!.before).not.toContain("Second fragment body.");
    expect(result!.before).not.toContain(sent("frag-2"));

    // After starts at the frag-3 sentinel (frag-2 body hidden).
    expect(result!.after).toContain(sent("frag-3"));
    expect(result!.after).toContain("Third fragment body.");
    expect(result!.after).not.toContain("Second fragment body.");
  });

  it("splits correctly for the first fragment", () => {
    const markdown = [sent("frag-1"), "First body.", "", sent("frag-2"), "Second body."].join("\n");

    const result = splitAroundFragment(markdown, "frag-1");
    expect(result).not.toBeNull();

    // Nothing precedes the first sentinel.
    expect(result!.before).toBe("");

    // After starts at the next sentinel.
    expect(result!.after).toContain(sent("frag-2"));
    expect(result!.after).toContain("Second body.");
    expect(result!.after).not.toContain("First body.");
  });

  it("after is empty when the edited fragment is the last one", () => {
    const markdown = [sent("frag-1"), "First body.", "", sent("frag-2"), "Last body."].join("\n");

    const result = splitAroundFragment(markdown, "frag-2");
    expect(result).not.toBeNull();

    expect(result!.before).toContain("First body.");
    expect(result!.before).not.toContain("Last body.");
    expect(result!.after).toBe("");
  });

  it("trims trailing whitespace from the before region", () => {
    const markdown = `Content.\n\n${sent("frag-1")}\nBody.`;

    const result = splitAroundFragment(markdown, "frag-1");
    expect(result).not.toBeNull();
    expect(result!.before).toBe("Content.");
  });

  it("the after region starts with the sentinel (parseable by ReadonlyProse)", () => {
    const markdown = [sent("frag-1"), "A.", "", sent("frag-2"), "B."].join("\n");

    const result = splitAroundFragment(markdown, "frag-1");
    expect(result!.after.startsWith(sent("frag-2"))).toBe(true);
  });
});
