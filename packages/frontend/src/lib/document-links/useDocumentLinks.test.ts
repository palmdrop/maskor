import { describe, it, expect } from "vitest";
import { toFragmentLookup } from "./useDocumentLinks";

describe("toFragmentLookup", () => {
  it("prefers the active fragment when a key is shared with a discarded one", () => {
    const lookup = toFragmentLookup([
      { key: "intro", uuid: "discarded-uuid", isDiscarded: true },
      { key: "intro", uuid: "active-uuid", isDiscarded: false },
    ]);
    expect(lookup.get("intro")).toBe("active-uuid");
  });

  it("prefers the active fragment regardless of list order", () => {
    const lookup = toFragmentLookup([
      { key: "intro", uuid: "active-uuid", isDiscarded: false },
      { key: "intro", uuid: "discarded-uuid", isDiscarded: true },
    ]);
    expect(lookup.get("intro")).toBe("active-uuid");
  });

  it("falls back to a discarded fragment when no active one shares the key", () => {
    const lookup = toFragmentLookup([{ key: "old", uuid: "discarded-uuid", isDiscarded: true }]);
    expect(lookup.get("old")).toBe("discarded-uuid");
  });

  it("maps distinct keys to their own uuids", () => {
    const lookup = toFragmentLookup([
      { key: "a", uuid: "uuid-a", isDiscarded: false },
      { key: "b", uuid: "uuid-b", isDiscarded: false },
    ]);
    expect(lookup.get("a")).toBe("uuid-a");
    expect(lookup.get("b")).toBe("uuid-b");
  });
});
