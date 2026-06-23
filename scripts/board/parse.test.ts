import { describe, expect, test } from "bun:test";
import {
  countFindings,
  countTasks,
  parsePlan,
  parseReview,
  parseSpec,
  parseTitle,
  reviewStem,
} from "./parse.ts";

const PLAN = `# Margins refactor

**Date**: 01-06-2026
**Status**: In progress <!-- Todo | In progress | Done -->
**Specs**: \`specifications/margins.md\`, \`specifications/fragment-editor.md\`
**Branch**: agent/margins-refactor
**Lifecycle**: building

## Tasks

- [x] Task A _(2026-06-01)_
- [ ] Task B
- [-] Task C _(dropped)_
- [ ] Task D
`;

describe("parsePlan", () => {
  test("extracts title, status, specs, branch, lifecycle", () => {
    const plan = parsePlan(PLAN, "margins-refactor");
    expect(plan.title).toBe("Margins refactor");
    expect(plan.humanStatus).toBe("in-progress");
    expect(plan.specs).toEqual(["specifications/margins.md", "specifications/fragment-editor.md"]);
    expect(plan.declaredBranch).toBe("agent/margins-refactor");
    expect(plan.declaredLifecycle).toBe("building");
  });

  test("counts dropped tasks as done", () => {
    const plan = parsePlan(PLAN, "x");
    expect(plan.tasksTotal).toBe(4);
    expect(plan.tasksDone).toBe(2); // [x] + [-]
  });

  test("falls back to stem when no heading", () => {
    expect(parseTitle("no heading here", "fallback")).toBe("fallback");
  });

  test("free-form status normalizes to in-progress", () => {
    const plan = parsePlan("**Status**: Phases 1–5 complete", "x");
    expect(plan.humanStatus).toBe("in-progress");
  });

  test("Done with trailing detail normalizes to done", () => {
    const plan = parsePlan("**Status**: Done (with follow-up)", "x");
    expect(plan.humanStatus).toBe("done");
  });

  test("parses a **Merged** provenance sha (ignoring surrounding prose)", () => {
    expect(parsePlan("**Merged**: 1a2b3c4 (squash into main)", "x").declaredMergeSha).toBe(
      "1a2b3c4",
    );
    expect(parsePlan("# no merged line", "x").declaredMergeSha).toBeNull();
  });
});

describe("countTasks", () => {
  test("ignores non-task bullets", () => {
    expect(countTasks("- a\n- [ ] b\n- [x] c")).toEqual({ done: 1, total: 2 });
  });
});

describe("reviewStem", () => {
  test("strips trailing date", () => {
    expect(reviewStem("fragment-split-2026-06-13")).toEqual({
      stem: "fragment-split",
      date: "2026-06-13",
    });
  });
  test("leaves undated stems", () => {
    expect(reviewStem("margins-findings")).toEqual({
      stem: "margins-findings",
      date: null,
    });
  });
});

describe("countFindings", () => {
  test("counts numbered findings and checkbox state", () => {
    const review = `## Bugs
### [ ] 1. Broken
### [x] 2. Fixed
## Design
### [ ] 3. Awkward
`;
    expect(countFindings(review)).toEqual({
      total: 3,
      uncheckedCheckboxes: 2,
      hasCheckboxes: true,
    });
  });

  test("counts legacy findings without checkboxes", () => {
    const review = `### 1. A\n### 2. B\n`;
    expect(countFindings(review)).toEqual({
      total: 2,
      uncheckedCheckboxes: 0,
      hasCheckboxes: false,
    });
  });
});

describe("parseReview", () => {
  test("explicit Status header wins", () => {
    const review = `**Status**: Resolved\n### 1. thing\n`;
    expect(parseReview(review).status).toBe("resolved");
  });

  test("checkboxes drive status when no header", () => {
    expect(parseReview("### [ ] 1. open\n").status).toBe("open");
    expect(parseReview("### [x] 1. closed\n").status).toBe("resolved");
  });

  test("resolution section implies resolved for legacy reviews", () => {
    const review = `### 1. thing\n## Resolution (2026-06-13)\nfixed.`;
    expect(parseReview(review).status).toBe("resolved");
  });

  test("bare legacy review is unmarked", () => {
    expect(parseReview("### 1. thing\n").status).toBe("unmarked");
  });

  test("extracts plan ref", () => {
    const review = "**Plan**: `references/plans/fragment-split.md`\n";
    expect(parseReview(review).planRef).toBe("fragment-split");
  });
});

describe("parseSpec", () => {
  const spec = `# Spec
**Status**: Implemented
**Shipped**:

- 2026-06-01 — did a thing (plan: \`references/plans/margins.md\`)

---
## Outcome
`;
  test("reads status and shipped mention", () => {
    expect(parseSpec(spec, "margins")).toEqual({
      status: "Implemented",
      shippedMentionsPlan: true,
    });
  });
  test("absent plan not mentioned", () => {
    expect(parseSpec(spec, "unrelated").shippedMentionsPlan).toBe(false);
  });
});
