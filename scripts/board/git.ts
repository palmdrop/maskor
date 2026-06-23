/**
 * Thin git wrappers plus the pure plan→branch matcher. Git is the source of
 * truth for branch existence, merge state, worktrees, and activity — none of it
 * is duplicated into the plan files.
 */

import { execFileSync } from "node:child_process";
import { STALE_DAYS, type BranchState, type MergeConfirmation } from "./types.ts";

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

/** Run a git command for its exit code only (0 → true). For predicates like --is-ancestor. */
function gitOk(args: string[], cwd: string): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
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

/**
 * Pure merge-confirmation ladder: given the three signals, pick the strongest.
 * Separated from git so it can be unit-tested with injected results.
 */
export function classifyMergeConfirmation(signals: {
  isAncestor: boolean;
  declaredShaInMain: boolean;
  squashEquivalent: boolean;
}): MergeConfirmation {
  if (signals.isAncestor) return "ancestor";
  if (signals.declaredShaInMain) return "provenance";
  if (signals.squashEquivalent) return "squash";
  return "unconfirmed";
}

/**
 * Best-effort squash detection: is the branch's *combined* diff (squashed onto the
 * merge-base) already a patch in main? Synthesizes a throwaway squash commit and
 * asks `git cherry` for patch-equivalence. Fails to `false` once main edits the
 * same lines after the squash — a safe false-negative, never a false-positive.
 */
function isSquashEquivalent(branch: string, repoRoot: string): boolean {
  const mergeBase = git(["merge-base", MAIN_BRANCH, branch], repoRoot);
  if (!mergeBase) return false;
  const tree = git(["rev-parse", `${branch}^{tree}`], repoRoot);
  if (!tree) return false;
  const squashCommit = git(["commit-tree", tree, "-p", mergeBase, "-m", "_"], repoRoot);
  if (!squashCommit) return false;
  // A `-`-prefixed line means the combined patch already exists in main.
  return git(["cherry", MAIN_BRANCH, squashCommit], repoRoot)
    .split("\n")
    .some((line) => line.startsWith("-"));
}

/**
 * Confirm whether a branch's work is in main, running the ladder's git probes in
 * cost order and short-circuiting on the first definitive hit.
 */
export function confirmMerge(
  branch: string,
  repoRoot: string,
  declaredMergeSha: string | null,
): MergeConfirmation {
  const isAncestor = gitOk(["merge-base", "--is-ancestor", branch, MAIN_BRANCH], repoRoot);
  const declaredShaInMain =
    !isAncestor && !!declaredMergeSha
      ? gitOk(["merge-base", "--is-ancestor", declaredMergeSha, MAIN_BRANCH], repoRoot)
      : false;
  const squashEquivalent =
    !isAncestor && !declaredShaInMain ? isSquashEquivalent(branch, repoRoot) : false;
  return classifyMergeConfirmation({ isAncestor, declaredShaInMain, squashEquivalent });
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
  declaredMergeSha: string | null,
): BranchState {
  if (!branch) {
    return {
      branch: null,
      exists: false,
      merged: false,
      mergeConfirmation: "unconfirmed",
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
  const mergeConfirmation = exists
    ? confirmMerge(branch, repoRoot, declaredMergeSha)
    : "unconfirmed";
  const merged = mergeConfirmation !== "unconfirmed";
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
    mergeConfirmation,
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
