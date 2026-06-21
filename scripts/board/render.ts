/**
 * Pure renderers. `renderMarkdown` produces the human cockpit (`references/STATUS.md`);
 * `renderJson` produces the agent-consumable view (`--json`, like `gwq status --json`).
 */

import { LIFECYCLE_STAGES, type Board, type BoardRow } from "./types.ts";

function branchCell(row: BoardRow): string {
  const git = row.git;
  if (!git.branch) return "—";
  if (git.merged) return `${git.branch} (merged)`;
  if (!git.exists) return `${git.branch} (declared, missing)`;
  const parts: string[] = [git.branch];
  if (git.hasWorktree) parts.push("⊙wt");
  if (git.ahead || git.behind) parts.push(`↑${git.ahead}↓${git.behind}`);
  if (git.ageDays !== null) parts.push(`${git.ageDays}d`);
  return parts.join(" ");
}

function reviewCell(row: BoardRow): string {
  if (!row.review) return "—";
  if (row.openFindings > 0) return `⚠ ${row.openFindings} open`;
  if (row.review.status === "resolved") return "✓ resolved";
  if (row.review.status === "unmarked") return "· unmarked";
  return row.review.status;
}

function specCell(row: BoardRow): string {
  if (row.specs.length === 0) return "—";
  return row.specs
    .map((spec) => {
      const name = spec.path.replace(/^specifications\//, "").replace(/\.md$/, "");
      const shipped = spec.shippedMentionsPlan ? "✓" : "·";
      return `${name}${shipped}`;
    })
    .join(", ");
}

export function renderMarkdown(board: Board): string {
  const lines: string[] = [];
  lines.push("# Work board");
  lines.push("");
  lines.push(
    `Generated ${board.generatedAt} — **do not edit** (regenerate with \`bun run board\`).`,
  );
  lines.push("");
  lines.push(
    `Vantage: ${board.vantageWorktrees.length} worktree(s) — ${board.vantageWorktrees
      .map((path) => `\`${path}\``)
      .join(", ")}`,
  );
  lines.push("");

  // Needs-attention section first: the whole point of the cockpit.
  const flagged = board.rows.filter((row) => row.attention.length > 0);
  lines.push("## ⚠ Needs attention");
  lines.push("");
  if (flagged.length === 0) {
    lines.push("Nothing flagged.");
  } else {
    for (const row of flagged) {
      lines.push(`- **${row.plan.stem}** (${row.stage}) — ${row.attention.join("; ")}`);
    }
  }
  lines.push("");

  // Grouped by lifecycle stage.
  for (const stage of LIFECYCLE_STAGES) {
    const rows = board.rows.filter((row) => row.stage === stage);
    if (rows.length === 0) continue;
    lines.push(`## ${stage} (${rows.length})`);
    lines.push("");
    lines.push("| plan | tasks | branch | review | spec |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of rows) {
      const tasks = row.plan.tasksTotal > 0 ? `${row.plan.tasksDone}/${row.plan.tasksTotal}` : "—";
      lines.push(
        `| ${row.plan.stem} | ${tasks} | ${branchCell(row)} | ${reviewCell(
          row,
        )} | ${specCell(row)} |`,
      );
    }
    lines.push("");
  }

  // Hygiene summary.
  lines.push("## Hygiene");
  lines.push("");
  const { hygiene } = board;
  lines.push(`- Merged local branches (prunable): ${hygiene.mergedLocalBranches.length}`);
  lines.push(`- Merged remote branches (prunable): ${hygiene.mergedRemoteBranches.length}`);
  lines.push(`- Name mismatches: ${hygiene.nameMismatches.length}`);
  lines.push(`- Orphan worktrees: ${hygiene.orphanWorktrees.length}`);
  lines.push("");
  lines.push("Run `bun run board --prune` for the actionable list.");
  lines.push("");

  // Inbox counts.
  lines.push("## Idea inbox");
  lines.push("");
  lines.push(`- \`references/TODO.md\`: ${board.inbox.todo} open`);
  lines.push(`- \`specifications/_drafts.md\`: ${board.inbox.drafts} open`);
  lines.push(`- \`tasks/\`: ${board.inbox.tasks} PRD(s)`);
  lines.push("");

  return lines.join("\n");
}

export function renderJson(board: Board): string {
  return JSON.stringify(board, null, 2);
}

export function renderPrune(board: Board): string {
  const lines: string[] = [];
  const { hygiene } = board;

  lines.push("# Prune report");
  lines.push("");

  lines.push("## Merged local branches — safe to delete");
  if (hygiene.mergedLocalBranches.length === 0) {
    lines.push("None.");
  } else {
    for (const branch of hygiene.mergedLocalBranches) {
      lines.push(`git branch -d ${branch}`);
    }
  }
  lines.push("");

  lines.push("## Merged remote branches — safe to delete");
  if (hygiene.mergedRemoteBranches.length === 0) {
    lines.push("None.");
  } else {
    for (const remote of hygiene.mergedRemoteBranches) {
      const name = remote.replace(/^origin\//, "");
      lines.push(`git push origin --delete ${name}`);
    }
  }
  lines.push("");

  lines.push("## Name mismatches (worktree / branch / plan)");
  lines.push(
    hygiene.nameMismatches.length === 0
      ? "None."
      : hygiene.nameMismatches.map((entry) => `- ${entry}`).join("\n"),
  );
  lines.push("");

  lines.push("## Orphan worktrees (branch with no matching plan)");
  lines.push(
    hygiene.orphanWorktrees.length === 0
      ? "None."
      : hygiene.orphanWorktrees.map((entry) => `- ${entry}`).join("\n"),
  );
  lines.push("");

  lines.push("Nothing was deleted. Review and run the commands yourself.");
  return lines.join("\n");
}
