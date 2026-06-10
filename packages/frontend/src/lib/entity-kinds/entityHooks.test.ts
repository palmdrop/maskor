import { describe, it, expect } from "vitest";
import { getGetFragmentStatsQueryKey } from "@api/generated/stats/stats";
import { ENTITY_HOOKS } from "./entityHooks";

describe("ENTITY_HOOKS selectors", () => {
  it("reference: picks .reference and the fragment cascade warnings", () => {
    const data = { reference: { uuid: "r1", key: "ref" }, warnings: { fragments: ["f1", "f2"] } };
    expect(ENTITY_HOOKS.reference.selectEntity(data)).toEqual({ uuid: "r1", key: "ref" });
    expect(ENTITY_HOOKS.reference.selectWarnings(data)).toEqual(["f1", "f2"]);
    expect(ENTITY_HOOKS.reference.bodyField).toBe("content");
    expect(ENTITY_HOOKS.reference.idParamKey).toBe("referenceId");
  });

  it("note: picks .note and flattens fragment + aspect warnings", () => {
    const data = { note: { uuid: "n1" }, warnings: { fragments: ["f1"], aspects: ["a1"] } };
    expect(ENTITY_HOOKS.note.selectEntity(data)).toEqual({ uuid: "n1" });
    expect(ENTITY_HOOKS.note.selectWarnings(data)).toEqual(["f1", "a1"]);
    expect(ENTITY_HOOKS.note.bodyField).toBe("content");
    expect(ENTITY_HOOKS.note.idParamKey).toBe("noteId");
  });

  it("aspect: picks .aspect, warnings is already a flat list, body is description", () => {
    const data = { aspect: { uuid: "a1" }, warnings: ["w1", "w2"] };
    expect(ENTITY_HOOKS.aspect.selectEntity(data)).toEqual({ uuid: "a1" });
    expect(ENTITY_HOOKS.aspect.selectWarnings(data)).toEqual(["w1", "w2"]);
    expect(ENTITY_HOOKS.aspect.bodyField).toBe("description");
    expect(ENTITY_HOOKS.aspect.idParamKey).toBe("aspectId");
  });

  it("fragment: picks .fragment, flat warnings, and invalidates fragment stats", () => {
    const data = { fragment: { uuid: "fr1" }, warnings: [] };
    expect(ENTITY_HOOKS.fragment.selectEntity(data)).toEqual({ uuid: "fr1" });
    expect(ENTITY_HOOKS.fragment.selectWarnings(data)).toEqual([]);
    expect(ENTITY_HOOKS.fragment.bodyField).toBe("content");
    expect(ENTITY_HOOKS.fragment.idParamKey).toBe("fragmentId");
    expect(ENTITY_HOOKS.fragment.getExtraInvalidateKeys?.("p1", "fr1")).toEqual([
      getGetFragmentStatsQueryKey("p1", "fr1"),
    ]);
  });

  it("only fragment carries extra invalidate keys", () => {
    expect(ENTITY_HOOKS.reference.getExtraInvalidateKeys).toBeUndefined();
    expect(ENTITY_HOOKS.note.getExtraInvalidateKeys).toBeUndefined();
    expect(ENTITY_HOOKS.aspect.getExtraInvalidateKeys).toBeUndefined();
  });
});
