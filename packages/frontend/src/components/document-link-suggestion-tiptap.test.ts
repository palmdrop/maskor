import { describe, it, expect } from "vitest";
import { buildDocumentLink } from "@maskor/shared";
import { filterItems, type LinkSuggestionItem } from "./document-link-suggestion-tiptap";

const items: LinkSuggestionItem[] = [
  { pathType: "fragments", key: "chapter-one" },
  { pathType: "notes", key: "setting-notes" },
  { pathType: "references", key: "the-city" },
  { pathType: "aspects", key: "grief" },
];

describe("filterItems", () => {
  it("returns all items for an empty query", () => {
    expect(filterItems(items, "")).toEqual(items);
    expect(filterItems(items, "   ")).toEqual(items);
  });

  it("matches on the key, case-insensitively", () => {
    expect(filterItems(items, "GRIEF")).toEqual([{ pathType: "aspects", key: "grief" }]);
  });

  it("matches on the `type/key` path", () => {
    expect(filterItems(items, "notes/setting")).toEqual([
      { pathType: "notes", key: "setting-notes" },
    ]);
  });

  it("matches a type prefix across entities of that type", () => {
    expect(filterItems(items, "references/")).toEqual([
      { pathType: "references", key: "the-city" },
    ]);
  });

  it("returns nothing for a non-matching query", () => {
    expect(filterItems(items, "nonexistent")).toEqual([]);
  });

  it("returns nothing when the query contains a bracket (caret is in/after a closed link)", () => {
    // The matcher sweeps up a `]` when the caret sits in or just past an existing `[[…]]` link;
    // returning nothing keeps the popup from appearing there.
    expect(filterItems(items, "notes/setting-notes]]")).toEqual([]);
    expect(filterItems(items, "grief]")).toEqual([]);
  });

  it("caps the result list", () => {
    const many: LinkSuggestionItem[] = Array.from({ length: 50 }, (_, index) => ({
      pathType: "notes" as const,
      key: `note-${index}`,
    }));
    expect(filterItems(many, "note").length).toBe(30);
  });
});

describe("insertion format", () => {
  it("inserts the canonical full-path link for a selected item", () => {
    const item = items[1]!;
    expect(buildDocumentLink(item.pathType, item.key)).toBe("[[notes/setting-notes]]");
  });
});
