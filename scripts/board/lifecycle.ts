/**
 * Pure lifecycle derivation. Git reality wins over what a plan file claims, so a
 * plan marked "Done" whose branch never merged still surfaces as in-flight.
 */

import type { BranchState, LifecycleStage, PlanRecord, ReviewRecord } from "./types.ts";

export interface DerivedStage {
  stage: LifecycleStage;
  attention: string[];
}

export function deriveStage(
  plan: PlanRecord,
  git: BranchState,
  review: ReviewRecord | null,
  openFindings: number,
): DerivedStage {
  const attention: string[] = [];

  if (plan.diverges) {
    attention.push("plan content differs across worktrees");
  }
  if (git.ambiguous) {
    attention.push(`branch match ambiguous (using ${git.branch})`);
  }
  if (git.stale) {
    attention.push(`branch idle ${git.ageDays}d`);
  }

  // Explicit override always wins.
  if (plan.declaredLifecycle) {
    if (plan.declaredLifecycle === "fixes-pending" && openFindings === 0) {
      attention.push("declared fixes-pending but no open findings");
    }
    return { stage: plan.declaredLifecycle, attention };
  }

  if (plan.humanStatus === "done" && git.branch && !git.merged && git.exists) {
    attention.push("plan marked Done but branch not merged");
  }
  if (plan.humanStatus === "in-progress" && !git.exists) {
    attention.push("plan In progress but has no branch");
  }

  // Merged branch.
  if (git.merged) {
    if (openFindings > 0) {
      attention.push(`${openFindings} open review finding(s) on merged branch`);
    }
    return { stage: plan.humanStatus === "done" ? "done" : "merged", attention };
  }

  // Live, unmerged branch.
  if (git.exists) {
    if (review && openFindings > 0) {
      attention.push(`${openFindings} open review finding(s)`);
      return { stage: "fixes-pending", attention };
    }
    if (review) {
      attention.push("reviewed, awaiting merge");
      return { stage: "in-review", attention };
    }
    return { stage: "building", attention };
  }

  // No branch.
  if (plan.humanStatus === "done") return { stage: "done", attention };
  if (plan.humanStatus === "in-progress") return { stage: "building", attention };
  if (plan.humanStatus === "todo") return { stage: "planned", attention };
  return { stage: "planned", attention };
}

/**
 * Open-finding count, tolerant of legacy reviews. A review on a merged branch is
 * assumed resolved when it carries no machine-readable markers.
 */
export function countOpenFindings(review: ReviewRecord | null, branchMerged: boolean): number {
  if (!review) return 0;
  if (review.status === "resolved") return 0;
  if (review.status === "open") return review.findingsTotal;
  if (review.status === "partially-addressed")
    return Math.max(1, Math.ceil(review.findingsTotal / 2));
  // Unmarked: trust merge state, otherwise treat findings as open.
  if (review.status === "unmarked") {
    if (branchMerged || review.hasResolutionSection) return 0;
    return review.findingsTotal;
  }
  return 0;
}
