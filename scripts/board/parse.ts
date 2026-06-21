/**
 * Pure parsers for plan, review, and spec markdown. No filesystem or git access —
 * every function takes raw file content so the suite can test against fixtures.
 */

import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type PlanHumanStatus,
  type ReviewStatus,
} from "./types.ts";

/** Reads a `**Field**: value` line (the bold-line "frontmatter" plans use). */
function readBoldField(content: string, field: string): string | null {
  const pattern = new RegExp(`^\\*\\*${field}\\*\\*:\\s*(.+?)\\s*$`, "im");
  const match = content.match(pattern);
  if (!match || match[1] === undefined) return null;
  // Strip trailing HTML comments like `<!-- ... -->`.
  const value = match[1].replace(/<!--.*?-->/g, "").trim();
  return value.length > 0 ? value : null;
}

/** The first `# Heading` becomes the title; falls back to the stem. */
export function parseTitle(content: string, stem: string): string {
  const match = content.match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim() ?? stem;
}

function normalizeHumanStatus(raw: string | null): PlanHumanStatus {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower.startsWith("done")) return "done";
  if (lower.startsWith("in progress") || lower.startsWith("in-progress")) return "in-progress";
  if (lower.startsWith("todo")) return "todo";
  // Free-form statuses ("Phases 1–5 complete; ...") imply work in flight.
  return "in-progress";
}

function normalizeLifecycle(raw: string | null): LifecycleStage | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return (LIFECYCLE_STAGES as readonly string[]).includes(lower) ? (lower as LifecycleStage) : null;
}

/** Counts `- [ ]` / `- [x]` / `- [-]` task lines. Dropped (`[-]`) count as done. */
export function countTasks(content: string): { done: number; total: number } {
  const lines = content.split("\n");
  let done = 0;
  let total = 0;
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[([ xX-])\]/);
    if (!match) continue;
    total += 1;
    const mark = match[1]!.toLowerCase();
    if (mark === "x" || mark === "-") done += 1;
  }
  return { done, total };
}

/** Splits a `**Specs**:` line into individual spec paths. */
function parseSpecs(content: string): string[] {
  const raw = readBoldField(content, "Specs");
  if (!raw) return [];
  const matches = raw.match(/`([^`]+\.md)`/g) ?? [];
  return matches.map((token) => token.replace(/`/g, "").trim());
}

export interface ParsedPlan {
  title: string;
  humanStatus: PlanHumanStatus;
  declaredLifecycle: LifecycleStage | null;
  declaredBranch: string | null;
  specs: string[];
  tasksDone: number;
  tasksTotal: number;
}

export function parsePlan(content: string, stem: string): ParsedPlan {
  const tasks = countTasks(content);
  return {
    title: parseTitle(content, stem),
    humanStatus: normalizeHumanStatus(readBoldField(content, "Status")),
    declaredLifecycle: normalizeLifecycle(readBoldField(content, "Lifecycle")),
    declaredBranch: readBoldField(content, "Branch"),
    specs: parseSpecs(content),
    tasksDone: tasks.done,
    tasksTotal: tasks.total,
  };
}

/** Strips a trailing `-YYYY-MM-DD` from a review filename stem. */
export function reviewStem(fileStem: string): {
  stem: string;
  date: string | null;
} {
  const match = fileStem.match(/^(.*?)-(\d{4}-\d{2}-\d{2})$/);
  if (match) return { stem: match[1]!, date: match[2]! };
  return { stem: fileStem, date: null };
}

function normalizeReviewStatus(raw: string | null): ReviewStatus | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("resolved")) return "resolved";
  if (lower.startsWith("partially")) return "partially-addressed";
  if (lower.startsWith("open")) return "open";
  return null;
}

/** Counts numbered findings (`### N. ...` or `### [ ] N. ...`) in a review. */
export function countFindings(content: string): {
  total: number;
  uncheckedCheckboxes: number;
  hasCheckboxes: boolean;
} {
  const lines = content.split("\n");
  let total = 0;
  let unchecked = 0;
  let hasCheckboxes = false;
  for (const line of lines) {
    // Optional `[ ]`/`[x]` checkbox, then a leading number: `### [ ] 1. Title`.
    const match = line.match(/^###\s+(?:\[([ xX])\]\s+)?\d+\./);
    if (!match) continue;
    total += 1;
    if (match[1] !== undefined) {
      hasCheckboxes = true;
      if (match[1].toLowerCase() !== "x") unchecked += 1;
    }
  }
  return { total, uncheckedCheckboxes: unchecked, hasCheckboxes };
}

export interface ParsedReview {
  status: ReviewStatus;
  findingsTotal: number;
  uncheckedCheckboxes: number;
  hasCheckboxes: boolean;
  hasResolutionSection: boolean;
  planRef: string | null;
}

export function parseReview(content: string): ParsedReview {
  const findings = countFindings(content);
  const hasResolutionSection = /^##\s+Resolution\b/m.test(content);
  const declaredStatus = normalizeReviewStatus(readBoldField(content, "Status"));

  let status: ReviewStatus;
  if (declaredStatus) {
    status = declaredStatus;
  } else if (findings.hasCheckboxes) {
    status = findings.uncheckedCheckboxes === 0 ? "resolved" : "open";
  } else if (hasResolutionSection) {
    status = "resolved";
  } else {
    status = "unmarked";
  }

  const planLine = readBoldField(content, "Plan");
  const planRefMatch = planLine?.match(/plans\/([\w-]+)\.md/);

  return {
    status,
    findingsTotal: findings.total,
    uncheckedCheckboxes: findings.uncheckedCheckboxes,
    hasCheckboxes: findings.hasCheckboxes,
    hasResolutionSection,
    planRef: planRefMatch?.[1] ?? null,
  };
}

/** Parses a spec's `**Status**:` and whether its `**Shipped**:` log names a plan. */
export function parseSpec(
  content: string,
  planStem: string,
): { status: string | null; shippedMentionsPlan: boolean } {
  const status = readBoldField(content, "Status");
  // The Shipped log spans from the `**Shipped**:` marker to the first `---`.
  const shippedMatch = content.match(/\*\*Shipped\*\*:([\s\S]*?)(?:\n---|\n##|$)/);
  const shippedBlock = shippedMatch?.[1] ?? "";
  const shippedMentionsPlan = shippedBlock.includes(`${planStem}`);
  return { status, shippedMentionsPlan };
}
