import { describe, expect, test } from "bun:test";
import { renderJson, renderMarkdown, renderPrune } from "./render.ts";
import type { Board, BoardRow } from "./types.ts";

function row(overrides: Partial<BoardRow> = {}): BoardRow {
  return {
    plan: {
      stem: "margins",
      title: "Margins",
      humanStatus: "in-progress",
      declaredLifecycle: null,
      declaredBranch: null,
      declaredMergeSha: null,
      specs: ["specifications/margins.md"],
      tasksDone: 3,
      tasksTotal: 5,
      worktrees: ["/main"],
      diverges: false,
    },
    git: {
      branch: "agent/margins",
      exists: true,
      merged: false,
      mergeConfirmation: "unconfirmed",
      hasWorktree: true,
      worktreePath: "/wt/margins",
      ahead: 4,
      behind: 1,
      lastCommitISO: "2026-06-01T00:00:00Z",
      ageDays: 5,
      stale: false,
      ambiguous: false,
    },
    review: {
      stem: "margins",
      file: "margins-2026-06-04",
      date: "2026-06-04",
      status: "open",
      findingsTotal: 2,
      hasResolutionSection: false,
      planRef: "margins",
    },
    openFindings: 2,
    specs: [
      { path: "specifications/margins.md", status: "Implemented", shippedMentionsPlan: true },
    ],
    stage: "fixes-pending",
    attention: ["2 open review finding(s)"],
    ...overrides,
  };
}

function board(rows: BoardRow[]): Board {
  return {
    generatedAt: "2026-06-21T00:00:00Z",
    vantageWorktrees: ["/main", "/wt/margins"],
    rows,
    hygiene: {
      prunable: [
        { branch: "agent/old", confirmation: "ancestor" },
        { branch: "agent/squashed", confirmation: "squash" },
      ],
      verify: ["agent/maybe-shipped"],
      mergedRemoteBranches: ["origin/agent/old"],
      nameMismatches: ["worktree dir `x` ≠ branch `agent/y`"],
      orphanWorktrees: [],
    },
    inbox: { todo: 12, drafts: 3, tasks: 6 },
  };
}

describe("renderMarkdown", () => {
  const output = renderMarkdown(board([row()]));

  test("leads with needs-attention", () => {
    expect(output.indexOf("## ⚠ Needs attention")).toBeLessThan(output.indexOf("## fixes-pending"));
  });

  test("renders the flagged row in attention", () => {
    expect(output).toContain("**margins** (fixes-pending) — 2 open review finding(s)");
  });

  test("shows task ratio and branch detail", () => {
    expect(output).toContain("| margins | 3/5 |");
    expect(output).toContain("⊙wt");
    expect(output).toContain("↑4↓1");
  });

  test("shows open review count and shipped spec", () => {
    expect(output).toContain("⚠ 2 open");
    expect(output).toContain("margins✓");
  });

  test("includes hygiene and inbox", () => {
    expect(output).toContain("Prunable local branches (merge confirmed): 2");
    expect(output).toContain("Verify before pruning (Done but unconfirmed): 1");
    expect(output).toContain("`references/TODO.md`: 12 open");
  });

  test("empty attention says nothing flagged", () => {
    const clean = renderMarkdown(board([row({ attention: [] })]));
    expect(clean).toContain("Nothing flagged.");
  });
});

describe("renderPrune", () => {
  const output = renderPrune(board([row()]));
  test("uses -d for ancestor and -D for squash", () => {
    expect(output).toContain("git branch -d agent/old");
    expect(output).toContain("git branch -D agent/squashed");
  });
  test("lists verify branches separately, not as delete commands", () => {
    expect(output).toContain("Verify before pruning");
    expect(output).toContain("- agent/maybe-shipped");
    expect(output).not.toContain("git branch -d agent/maybe-shipped");
  });
  test("emits remote deletion command", () => {
    expect(output).toContain("git push origin --delete agent/old");
  });
  test("never deletes", () => {
    expect(output).toContain("Nothing was deleted.");
  });
});

describe("renderJson", () => {
  test("round-trips", () => {
    const parsed = JSON.parse(renderJson(board([row()])));
    expect(parsed.rows[0].plan.stem).toBe("margins");
    expect(parsed.inbox.todo).toBe(12);
  });
});
