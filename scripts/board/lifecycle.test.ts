import { describe, expect, test } from "bun:test";
import { countOpenFindings, deriveStage } from "./lifecycle.ts";
import type { BranchState, PlanRecord, ReviewRecord } from "./types.ts";

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    stem: "x",
    title: "X",
    humanStatus: "todo",
    declaredLifecycle: null,
    declaredBranch: null,
    specs: [],
    tasksDone: 0,
    tasksTotal: 0,
    worktrees: ["/main"],
    diverges: false,
    ...overrides,
  };
}

function branch(overrides: Partial<BranchState> = {}): BranchState {
  return {
    branch: null,
    exists: false,
    merged: false,
    hasWorktree: false,
    worktreePath: null,
    ahead: 0,
    behind: 0,
    lastCommitISO: null,
    ageDays: null,
    stale: false,
    ambiguous: false,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    stem: "x",
    file: "x-2026-06-01",
    date: "2026-06-01",
    status: "unmarked",
    findingsTotal: 0,
    hasResolutionSection: false,
    planRef: "x",
    ...overrides,
  };
}

describe("deriveStage", () => {
  test("no branch + todo → planned", () => {
    expect(deriveStage(plan(), branch(), null, 0).stage).toBe("planned");
  });

  test("no branch + done → done", () => {
    expect(deriveStage(plan({ humanStatus: "done" }), branch(), null, 0).stage).toBe("done");
  });

  test("live branch, no review → building", () => {
    const result = deriveStage(plan(), branch({ branch: "agent/x", exists: true }), null, 0);
    expect(result.stage).toBe("building");
  });

  test("live branch + review, no findings → in-review", () => {
    const result = deriveStage(plan(), branch({ branch: "agent/x", exists: true }), review(), 0);
    expect(result.stage).toBe("in-review");
  });

  test("live branch + open findings → fixes-pending", () => {
    const result = deriveStage(
      plan(),
      branch({ branch: "agent/x", exists: true }),
      review({ status: "open", findingsTotal: 3 }),
      3,
    );
    expect(result.stage).toBe("fixes-pending");
  });

  test("merged branch + plan done → done", () => {
    const result = deriveStage(
      plan({ humanStatus: "done" }),
      branch({ branch: "agent/x", exists: true, merged: true }),
      null,
      0,
    );
    expect(result.stage).toBe("done");
  });

  test("merged branch + plan not done → merged", () => {
    const result = deriveStage(
      plan({ humanStatus: "in-progress" }),
      branch({ branch: "agent/x", exists: true, merged: true }),
      null,
      0,
    );
    expect(result.stage).toBe("merged");
  });

  test("git reality overrides a Done plan with an unmerged branch", () => {
    const result = deriveStage(
      plan({ humanStatus: "done" }),
      branch({ branch: "agent/x", exists: true, merged: false }),
      null,
      0,
    );
    expect(result.stage).toBe("building");
    expect(result.attention).toContain("plan marked Done but branch not merged");
  });

  test("explicit lifecycle override wins", () => {
    const result = deriveStage(
      plan({ declaredLifecycle: "abandoned" }),
      branch({ branch: "agent/x", exists: true }),
      null,
      0,
    );
    expect(result.stage).toBe("abandoned");
  });

  test("stale and divergence raise attention", () => {
    const result = deriveStage(
      plan({ diverges: true }),
      branch({ branch: "agent/x", exists: true, stale: true, ageDays: 30 }),
      null,
      0,
    );
    expect(result.attention).toContain("plan content differs across worktrees");
    expect(result.attention).toContain("branch idle 30d");
  });
});

describe("countOpenFindings", () => {
  test("no review → 0", () => {
    expect(countOpenFindings(null, false)).toBe(0);
  });
  test("resolved → 0", () => {
    expect(countOpenFindings(review({ status: "resolved", findingsTotal: 5 }), false)).toBe(0);
  });
  test("open → all findings", () => {
    expect(countOpenFindings(review({ status: "open", findingsTotal: 4 }), false)).toBe(4);
  });
  test("unmarked on unmerged branch → all findings", () => {
    expect(countOpenFindings(review({ status: "unmarked", findingsTotal: 2 }), false)).toBe(2);
  });
  test("unmarked on merged branch → 0", () => {
    expect(countOpenFindings(review({ status: "unmarked", findingsTotal: 2 }), true)).toBe(0);
  });
});
