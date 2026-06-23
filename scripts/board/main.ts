/**
 * Work-tracking board generator. The orchestrator's cockpit.
 *
 * Usage (from repo root):
 *   bun run board            # regenerate references/STATUS.md
 *   bun run board --json     # print the joined model as JSON (for agents)
 *   bun run board --prune    # print actionable branch/worktree hygiene
 *   bun run board --stdout   # print the markdown without writing the file
 *
 * Pure read. The only write is references/STATUS.md (gitignored). Plans, reviews,
 * and specs are read from the union of all worktrees on disk. Git is the source
 * of truth for branch/merge/worktree/activity state. See references/WORKFLOW.md.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { collectAcrossWorktrees, countMarkdownFiles, countUncheckedItems } from "./collect.ts";
import {
  confirmMerge,
  describeBranch,
  listLocalBranches,
  listMergedRemoteBranches,
  listWorktrees,
  matchPlanToBranch,
  repoRootFrom,
  type Worktree,
} from "./git.ts";
import { countOpenFindings, deriveStage } from "./lifecycle.ts";
import { parsePlan, parseReview, parseSpec, reviewStem } from "./parse.ts";
import { renderJson, renderMarkdown, renderPrune } from "./render.ts";
import type {
  Board,
  BoardRow,
  HygieneReport,
  PlanRecord,
  PrunableBranch,
  ReviewRecord,
  SpecState,
} from "./types.ts";

function mainWorktreePath(worktrees: Worktree[], repoRoot: string): string {
  const main = worktrees.find((entry) => entry.branch === "main");
  return main?.path ?? repoRoot;
}

function buildHygiene(
  allBranches: string[],
  rows: BoardRow[],
  worktrees: Worktree[],
  repoRoot: string,
): HygieneReport {
  const planStems = new Set(rows.map((row) => row.plan.stem));
  const nameMismatches: string[] = [];
  const orphanWorktrees: string[] = [];

  for (const worktree of worktrees) {
    if (!worktree.branch || worktree.branch === "main") continue;
    const directoryStem = path.basename(worktree.path);
    const branchStem = worktree.branch.replace(/^agent\//, "");

    if (directoryStem !== branchStem) {
      nameMismatches.push(`worktree dir \`${directoryStem}\` ≠ branch \`${worktree.branch}\``);
    }
    // A worktree whose branch maps to no plan stem is likely abandoned/orphaned.
    const matchesPlan = planStems.has(branchStem) || planStems.has(worktree.branch);
    if (!matchesPlan) {
      orphanWorktrees.push(`\`${worktree.path}\` (${worktree.branch})`);
    }
  }

  // A branch checked out in any worktree cannot be deleted; backups are never pruned.
  const attached = new Set(
    worktrees.map((entry) => entry.branch).filter((name): name is string => !!name),
  );
  // Reuse the confirmation already computed per plan-branch (it used the plan's
  // **Merged** provenance); fall back to a provenance-less probe for plan-less branches.
  const confirmationByBranch = new Map(
    rows
      .filter((row) => row.git.branch)
      .map((row) => [row.git.branch!, row.git.mergeConfirmation] as const),
  );
  const donePlanBranches = new Set(
    rows
      .filter((row) => row.git.branch && row.plan.humanStatus === "done")
      .map((row) => row.git.branch!),
  );

  const prunable: PrunableBranch[] = [];
  const verify: string[] = [];
  for (const branch of allBranches) {
    if (branch === "main" || attached.has(branch) || branch.startsWith("backup/")) continue;
    const confirmation = confirmationByBranch.get(branch) ?? confirmMerge(branch, repoRoot, null);
    if (confirmation !== "unconfirmed") {
      prunable.push({ branch, confirmation });
    } else if (donePlanBranches.has(branch)) {
      // Plan says Done but no merge evidence — surface for a human check, never auto-prune.
      verify.push(branch);
    }
  }

  return {
    prunable,
    verify,
    mergedRemoteBranches: listMergedRemoteBranches(repoRoot),
    nameMismatches,
    orphanWorktrees,
  };
}

function buildBoard(cwd: string): Board {
  const repoRoot = repoRootFrom(cwd);
  const worktrees = listWorktrees(repoRoot);
  const mainPath = mainWorktreePath(worktrees, repoRoot);
  const branches = listLocalBranches(repoRoot);

  // Collect across the union of worktrees.
  const planFiles = collectAcrossWorktrees(worktrees, "references/plans", mainPath);
  const reviewFiles = collectAcrossWorktrees(worktrees, "references/reviews", mainPath);
  const specFilesByStem = new Map(
    collectAcrossWorktrees(worktrees, "specifications", mainPath).map((file) => [
      file.stem,
      file.content,
    ]),
  );

  // Index reviews by plan stem (latest date wins).
  const reviewsByStem = new Map<string, ReviewRecord>();
  for (const file of reviewFiles) {
    const { stem, date } = reviewStem(file.stem);
    const parsed = parseReview(file.content);
    const key = parsed.planRef ?? stem;
    const record: ReviewRecord = {
      stem: key,
      file: file.stem,
      date,
      status: parsed.status,
      findingsTotal: parsed.findingsTotal,
      hasResolutionSection: parsed.hasResolutionSection,
      planRef: parsed.planRef,
    };
    const existing = reviewsByStem.get(key);
    if (!existing || (date ?? "") > (existing.date ?? "")) {
      reviewsByStem.set(key, record);
    }
  }

  const rows: BoardRow[] = [];

  for (const file of planFiles) {
    const parsed = parsePlan(file.content, file.stem);
    const plan: PlanRecord = {
      stem: file.stem,
      title: parsed.title,
      humanStatus: parsed.humanStatus,
      declaredLifecycle: parsed.declaredLifecycle,
      declaredBranch: parsed.declaredBranch,
      declaredMergeSha: parsed.declaredMergeSha,
      specs: parsed.specs,
      tasksDone: parsed.tasksDone,
      tasksTotal: parsed.tasksTotal,
      worktrees: file.worktrees,
      diverges: file.diverges,
    };

    const match = matchPlanToBranch(plan.stem, plan.declaredBranch, branches);
    const git = describeBranch(
      match.branch,
      match.ambiguous,
      repoRoot,
      worktrees,
      plan.declaredMergeSha,
    );
    git.ambiguous = match.ambiguous;

    const review = reviewsByStem.get(plan.stem) ?? null;
    // Treat reviewed work as complete when the branch merged, or when the plan
    // is Done and its branch is gone (merged-and-deleted). Otherwise unmarked
    // legacy reviews on shipped work would read as open findings.
    const workComplete = git.merged || (plan.humanStatus === "done" && !git.exists);
    const openFindings = countOpenFindings(review, workComplete);

    const specs: SpecState[] = plan.specs.map((specPath) => {
      const specStem = specPath.replace(/^specifications\//, "").replace(/\.md$/, "");
      const content = specFilesByStem.get(specStem);
      if (!content) {
        return { path: specPath, status: null, shippedMentionsPlan: false };
      }
      const parsedSpec = parseSpec(content, plan.stem);
      return {
        path: specPath,
        status: parsedSpec.status,
        shippedMentionsPlan: parsedSpec.shippedMentionsPlan,
      };
    });

    const { stage, attention } = deriveStage(plan, git, review, openFindings);
    rows.push({ plan, git, review, openFindings, specs, stage, attention });
  }

  const inbox = {
    todo: countUncheckedItems(path.join(mainPath, "references/TODO.md")),
    drafts: countUncheckedItems(path.join(mainPath, "specifications/_drafts.md")),
    tasks: countMarkdownFiles(path.join(mainPath, "tasks")),
  };

  return {
    generatedAt: new Date().toISOString(),
    vantageWorktrees: worktrees.map((entry) => entry.path),
    rows,
    hygiene: buildHygiene(branches, rows, worktrees, repoRoot),
    inbox,
  };
}

function run(): void {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();
  const board = buildBoard(cwd);
  const repoRoot = repoRootFrom(cwd);

  if (argv.includes("--json")) {
    process.stdout.write(`${renderJson(board)}\n`);
    return;
  }
  if (argv.includes("--prune")) {
    process.stdout.write(`${renderPrune(board)}\n`);
    return;
  }

  const markdown = renderMarkdown(board);
  if (argv.includes("--stdout")) {
    process.stdout.write(`${markdown}\n`);
    return;
  }

  const outputPath = path.join(repoRoot, "references/STATUS.md");
  writeFileSync(outputPath, `${markdown}\n`, "utf8");
  process.stdout.write(
    `Wrote ${outputPath} — ${board.rows.length} plans, ${
      board.rows.filter((row) => row.attention.length > 0).length
    } flagged.\n`,
  );
}

run();
