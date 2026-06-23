import { describe, expect, test } from "bun:test";
import { classifyMergeConfirmation, matchPlanToBranch } from "./git.ts";

const BRANCHES = [
  "main",
  "agent/margins",
  "agent/margins-2",
  "agent/obsidian-comments",
  "document-links",
  "feat/sequence-rename-and-row-menu",
];

describe("matchPlanToBranch", () => {
  test("prefers explicit declared branch", () => {
    expect(matchPlanToBranch("document-links", "agent/obsidian-comments", BRANCHES)).toEqual({
      branch: "agent/obsidian-comments",
      ambiguous: false,
    });
  });

  test("declared branch returned even if not in list (declared, missing)", () => {
    expect(matchPlanToBranch("x", "agent/gone", BRANCHES)).toEqual({
      branch: "agent/gone",
      ambiguous: false,
    });
  });

  test("matches agent/<stem> exactly", () => {
    expect(matchPlanToBranch("margins", null, BRANCHES)).toEqual({
      branch: "agent/margins",
      ambiguous: false,
    });
  });

  test("matches bare <stem>", () => {
    expect(matchPlanToBranch("document-links", null, BRANCHES)).toEqual({
      branch: "document-links",
      ambiguous: false,
    });
  });

  test("no match returns null", () => {
    expect(matchPlanToBranch("nonexistent-plan", null, BRANCHES)).toEqual({
      branch: null,
      ambiguous: false,
    });
  });

  test("fuzzy multi-match flags ambiguous", () => {
    const result = matchPlanToBranch("margin", null, BRANCHES);
    expect(result.ambiguous).toBe(true);
    expect(result.branch).toContain("margin");
  });
});

describe("classifyMergeConfirmation", () => {
  const base = { isAncestor: false, declaredShaInMain: false, squashEquivalent: false };

  test("ancestor wins over everything", () => {
    expect(
      classifyMergeConfirmation({
        isAncestor: true,
        declaredShaInMain: true,
        squashEquivalent: true,
      }),
    ).toBe("ancestor");
  });

  test("provenance beats squash", () => {
    expect(
      classifyMergeConfirmation({ ...base, declaredShaInMain: true, squashEquivalent: true }),
    ).toBe("provenance");
  });

  test("squash when only patch-equivalence holds", () => {
    expect(classifyMergeConfirmation({ ...base, squashEquivalent: true })).toBe("squash");
  });

  test("unconfirmed when no signal", () => {
    expect(classifyMergeConfirmation(base)).toBe("unconfirmed");
  });
});
