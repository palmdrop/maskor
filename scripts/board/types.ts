/**
 * Shared types and the single lifecycle vocabulary for the work-tracking board.
 *
 * The board is the orchestrator's cockpit: one screen that joins every plan with
 * its live git state, review state, and spec state. See `references/WORKFLOW.md`.
 */

/**
 * The single lifecycle vocabulary. Replaces the two older, drifting vocabularies
 * (plan files used `Todo/In progress/Done`; the retired plans-manifest used
 * `draft/in-progress/implemented`). Ordering here is the canonical display order.
 */
export const LIFECYCLE_STAGES = [
  "idea", // captured but not yet planned
  "planned", // plan written, no branch yet
  "building", // branch exists, work in flight, no review yet
  "in-review", // a review exists, no open findings, awaiting merge
  "fixes-pending", // a review exists with open findings to address
  "merged", // branch merged into main, plan not yet marked Done
  "done", // shipped and closed
  "abandoned", // dropped; branch (if any) safe to delete
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Human `**Status**:` values found in plan files, normalized. */
export type PlanHumanStatus = "todo" | "in-progress" | "done" | "unknown";

/** A plan parsed from a `references/plans/<stem>.md` file. */
export interface PlanRecord {
  stem: string;
  title: string;
  humanStatus: PlanHumanStatus;
  /** Optional explicit override via a `**Lifecycle**:` line. */
  declaredLifecycle: LifecycleStage | null;
  /** Optional branch hint via a `**Branch**:` line, to resolve name drift. */
  declaredBranch: string | null;
  specs: string[];
  tasksDone: number;
  tasksTotal: number;
  /** Worktree paths whose `references/plans/` contains this stem. */
  worktrees: string[];
  /** True when the plan's content differs across worktrees. */
  diverges: boolean;
}

/** Resolution state of a review. */
export type ReviewStatus = "open" | "partially-addressed" | "resolved" | "unmarked";

/** A review parsed from a `references/reviews/<stem>-<date>.md` file. */
export interface ReviewRecord {
  /** Plan/feature stem, with the trailing `-YYYY-MM-DD` stripped. */
  stem: string;
  file: string;
  date: string | null;
  status: ReviewStatus;
  findingsTotal: number;
  hasResolutionSection: boolean;
  /** Stem of the plan referenced by the `**Plan**:` line, if any. */
  planRef: string | null;
}

/** Live git state for a plan's branch. */
export interface BranchState {
  branch: string | null;
  exists: boolean;
  merged: boolean;
  hasWorktree: boolean;
  worktreePath: string | null;
  ahead: number;
  behind: number;
  lastCommitISO: string | null;
  ageDays: number | null;
  /** Unmerged branch whose last commit is older than the stale threshold. */
  stale: boolean;
  /** True when more than one branch plausibly matched this plan. */
  ambiguous: boolean;
}

/** A spec referenced by a plan, with its own status. */
export interface SpecState {
  path: string;
  status: string | null;
  /** True when the spec's `**Shipped**:` log mentions this plan's stem. */
  shippedMentionsPlan: boolean;
}

/** The fully joined row for one unit of work. */
export interface BoardRow {
  plan: PlanRecord;
  git: BranchState;
  review: ReviewRecord | null;
  openFindings: number;
  specs: SpecState[];
  stage: LifecycleStage;
  /** Human-readable reasons this row needs orchestrator attention. */
  attention: string[];
}

/** Hygiene findings surfaced by `--prune`. */
export interface HygieneReport {
  mergedLocalBranches: string[];
  mergedRemoteBranches: string[];
  nameMismatches: string[];
  orphanWorktrees: string[];
}

/** Idea-inbox counts across the three pre-plan surfaces. */
export interface InboxCounts {
  todo: number;
  drafts: number;
  tasks: number;
}

/** The complete board model, ready to render. */
export interface Board {
  generatedAt: string;
  vantageWorktrees: string[];
  rows: BoardRow[];
  hygiene: HygieneReport;
  inbox: InboxCounts;
}

/** Unmerged branches older than this many days are flagged stale. */
export const STALE_DAYS = 14;
