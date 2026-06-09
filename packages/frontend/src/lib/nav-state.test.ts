import { describe, it, expect, beforeEach } from "vitest";
import {
  readLastFragment,
  writeLastFragment,
  clearLastFragment,
  readOverviewSequence,
  writeOverviewSequence,
  readOverviewSelection,
  writeOverviewSelection,
  overviewScrollKey,
  readPreviewSequence,
  writePreviewSequence,
  previewScrollKey,
  resolveLastFragmentView,
  resolveLastOverviewView,
  resolveLastPreviewView,
} from "./nav-state";

const PROJECT = "proj-123";

describe("nav-state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // --- fragments ---

  describe("fragments", () => {
    it("returns null when nothing stored", () => {
      expect(readLastFragment(PROJECT)).toBeNull();
    });

    it("round-trips a fragment id", () => {
      writeLastFragment(PROJECT, "frag-abc");
      expect(readLastFragment(PROJECT)).toBe("frag-abc");
    });

    it("clear removes the stored value", () => {
      writeLastFragment(PROJECT, "frag-abc");
      clearLastFragment(PROJECT);
      expect(readLastFragment(PROJECT)).toBeNull();
    });

    it("scopes to projectId", () => {
      writeLastFragment(PROJECT, "frag-abc");
      expect(readLastFragment("other-proj")).toBeNull();
    });
  });

  // --- overview ---

  describe("overview sequence", () => {
    it("returns null when nothing stored", () => {
      expect(readOverviewSequence(PROJECT)).toBeNull();
    });

    it("round-trips a sequence id", () => {
      writeOverviewSequence(PROJECT, "seq-xyz");
      expect(readOverviewSequence(PROJECT)).toBe("seq-xyz");
    });
  });

  describe("overview selection", () => {
    it("returns empty array when nothing stored", () => {
      expect(readOverviewSelection(PROJECT)).toEqual([]);
    });

    it("round-trips a selection array", () => {
      writeOverviewSelection(PROJECT, ["a", "b", "c"]);
      expect(readOverviewSelection(PROJECT)).toEqual(["a", "b", "c"]);
    });

    it("tolerates malformed JSON", () => {
      localStorage.setItem("maskor:nav:proj-123:overview:selection", "not-json{{{");
      expect(readOverviewSelection(PROJECT)).toEqual([]);
    });

    it("tolerates non-array JSON", () => {
      localStorage.setItem("maskor:nav:proj-123:overview:selection", '"just-a-string"');
      expect(readOverviewSelection(PROJECT)).toEqual([]);
    });

    it("filters out non-string array items", () => {
      localStorage.setItem(
        "maskor:nav:proj-123:overview:selection",
        JSON.stringify(["a", 42, null, "b"]),
      );
      expect(readOverviewSelection(PROJECT)).toEqual(["a", "b"]);
    });
  });

  describe("overview scroll key", () => {
    it("returns a stable per-project key", () => {
      expect(overviewScrollKey(PROJECT)).toBe("maskor:nav:proj-123:overview:scroll");
    });
  });

  // --- preview ---

  describe("preview sequence", () => {
    it("returns null when nothing stored", () => {
      expect(readPreviewSequence(PROJECT)).toBeNull();
    });

    it("round-trips a sequence id", () => {
      writePreviewSequence(PROJECT, "seq-preview-1");
      expect(readPreviewSequence(PROJECT)).toBe("seq-preview-1");
    });
  });

  describe("preview scroll key", () => {
    it("returns a stable per-project key", () => {
      expect(previewScrollKey(PROJECT)).toBe("maskor:nav:proj-123:preview:scroll");
    });
  });

  // --- resolveLastView ---

  describe("resolveLastFragmentView", () => {
    it("returns list kind when nothing stored", () => {
      expect(resolveLastFragmentView(PROJECT)).toEqual({ kind: "list" });
    });

    it("returns fragment kind with id when stored", () => {
      writeLastFragment(PROJECT, "frag-def");
      expect(resolveLastFragmentView(PROJECT)).toEqual({
        kind: "fragment",
        fragmentId: "frag-def",
      });
    });
  });

  describe("resolveLastOverviewView", () => {
    it("returns null sequence when nothing stored", () => {
      expect(resolveLastOverviewView(PROJECT)).toEqual({ sequence: null });
    });

    it("returns stored sequence", () => {
      writeOverviewSequence(PROJECT, "seq-ov-1");
      expect(resolveLastOverviewView(PROJECT)).toEqual({ sequence: "seq-ov-1" });
    });
  });

  describe("resolveLastPreviewView", () => {
    it("returns null sequence when nothing stored", () => {
      expect(resolveLastPreviewView(PROJECT)).toEqual({ sequence: null });
    });

    it("returns stored sequence", () => {
      writePreviewSequence(PROJECT, "seq-pv-1");
      expect(resolveLastPreviewView(PROJECT)).toEqual({ sequence: "seq-pv-1" });
    });
  });
});
