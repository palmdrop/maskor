/**
 * Thin git wrappers plus the pure plan→branch matcher. Git is the source of
 * truth for branch existence, merge state, worktrees, and activity — none of it
 * is duplicated into the plan files.
 */

import { execFileSync } from "node:child_process";
import { STALE_DAYS, type BranchState } from "./types.ts";

const MAIN_BRANCH = "main";

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export interface Worktree {
  path: string;
  branch: string | null;
}

export function listWorktrees(repoRoot: string): Worktree[] {
  const output = git(["worktree", "list", "--porcelain"], repoRoot);
  const worktrees: Worktree[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length).trim();
      branch = null;
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).trim().replace("refs/heads/", "");
    } else if (line.trim() === "" && path) {
      worktrees.push({ path, branch });
      path = null;
    }
  }
  if (path) worktrees.push({ path, branch });
  return worktrees;
}

export function listLocalBranches(repoRoot: string): string[] {
  const output = git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], repoRoot);
  return output ? output.split("\n").map((line) => line.trim()) : [];
}

export function listMergedLocalBranches(repoRoot: string): string[] {
  const output = git(["branch", "--merged", MAIN_BRANCH], repoRoot);
  return output
    .split("\n")
    .map((line) => line.replace(/^[*+]?\s*/, "").trim())
    .filter((name) => name.length > 0 && name !== MAIN_BRANCH);
}

export function listMergedRemoteBranches(repoRoot: string): string[] {
  const output = git(["branch", "-r", "--merged", MAIN_BRANCH], repoRoot);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && !name.includes("->") && name !== `origin/${MAIN_BRANCH}`);
}

/**
 * Resolve a plan stem to its branch. Priority:
 *   1. explicit `**Branch**:` hint
 *   2. exact `agent/<stem>`
 *   3. exact `<stem>`
 *   4. any branch ending in `/<stem>` or containing the stem (ambiguous if >1)
 * Pure so it can be unit-tested with an injected branch list.
 */
export function matchPlanToBranch(
  stem: string,
  declaredBranch: string | null,
  branches: string[],
): { branch: string | null; ambiguous: boolean } {
  if (declaredBranch && branches.includes(declaredBranch)) {
    return { branch: declaredBranch, ambiguous: false };
  }
  if (declaredBranch) return { branch: declaredBranch, ambiguous: false };

  const agentName = `agent/${stem}`;
  if (branches.includes(agentName)) return { branch: agentName, ambiguous: false };
  if (branches.includes(stem)) return { branch: stem, ambiguous: false };

  const suffixMatches = branches.filter((name) => name.endsWith(`/${stem}`));
  if (suffixMatches.length === 1) return { branch: suffixMatches[0]!, ambiguous: false };
  if (suffixMatches.length > 1) return { branch: suffixMatches[0]!, ambiguous: true };

  const fuzzy = branches.filter((name) => name.includes(stem));
  if (fuzzy.length === 1) return { branch: fuzzy[0]!, ambiguous: false };
  if (fuzzy.length > 1) return { branch: fuzzy[0]!, ambiguous: true };

  return { branch: null, ambiguous: false };
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function describeBranch(
  branch: string | null,
  ambiguous: boolean,
  repoRoot: string,
  worktrees: Worktree[],
  mergedLocal: string[],
): BranchState {
  if (!branch) {
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
    };
  }

  const exists = git(["rev-parse", "--verify", "--quiet", branch], repoRoot).length > 0;
  const merged = mergedLocal.includes(branch);
  const worktree = worktrees.find((entry) => entry.branch === branch) ?? null;

  let ahead = 0;
  let behind = 0;
  if (exists) {
    const counts = git(
      ["rev-list", "--left-right", "--count", `${MAIN_BRANCH}...${branch}`],
      repoRoot,
    );
    const [behindRaw, aheadRaw] = counts.split(/\s+/);
    behind = Number.parseInt(behindRaw ?? "0", 10) || 0;
    ahead = Number.parseInt(aheadRaw ?? "0", 10) || 0;
  }

  const lastCommitISO = exists
    ? git(["log", "-1", "--format=%cI", branch], repoRoot) || null
    : null;
  const ageDays = daysSince(lastCommitISO);
  const stale = exists && !merged && ageDays !== null && ageDays > STALE_DAYS;

  return {
    branch,
    exists,
    merged,
    hasWorktree: worktree !== null,
    worktreePath: worktree?.path ?? null,
    ahead,
    behind,
    lastCommitISO,
    ageDays,
    stale,
    ambiguous: false,
  };
}

export function repoRootFrom(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd) || cwd;
}
