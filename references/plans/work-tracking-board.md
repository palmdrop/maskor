# Work-tracking board

**Date**: 20-06-2026
**Status**: Done <!-- Todo | In progress | Done -->
**Branch**: agent/work-tracking-board
**Specs**: <!-- none; workflow documented in references/WORKFLOW.md rather than a product spec -->
**Closed**: 21-06-2026

---

## Outcome (2026-06-21)

Shipped. `bun run board` generates `references/STATUS.md` (gitignored) joining 84
plans × git × reviews × specs, with `--json`, `--stdout`, and `--prune` modes.
47 board unit tests; full `bun run verify` green.

Adaptations made during implementation (research-informed — "git is your state
machine", `gwq status`):

- **Git-inference-first** replaced the planned mass-backfill of 81 plan files. The
  board derives lifecycle from git reality + the existing `**Status**:` line, so it
  works on current data with zero edits. `**Branch**:` / `**Lifecycle**:` are
  optional overrides only.
- **`--json` output** added for the agent orchestrator (not in original plan).
- **Union-of-worktrees sourcing**: plans/reviews/specs read from every worktree on
  disk, deduped by stem, divergence flagged (per developer instruction).
- **Plans-manifest retired** (file + skill deleted; `plans-manifest-and-shipped-backfill`
  plan marked abandoned) per developer instruction — the board supersedes it.
- Review-resolution: formalized the emergent `## Resolution` section + a `**Status**:`
  header in the review template; legacy unmarked reviews assumed resolved once merged.

---

## Goal

> Running `bun run board` regenerates `references/STATUS.md` (gitignored) — a single screen that joins every plan with its live git state, review state, and spec state, so the human or agent orchestrator can answer "where are we across all in-flight work" without reading tmux, branches, or any individual file. A `--prune` mode lists merged/abandoned branches safe to delete and flags worktree/branch/plan name mismatches.

This is the "full sweep": the board, review-resolution tracking, and branch/worktree hygiene land together, because the board's value depends on the review and git data being trustworthy.

---

## Background — why

State about in-flight work is currently smeared across seven surfaces (plans, plans-manifest, reviews, specs, the three idea inboxes, ralph, and git) and nothing joins them. The orchestrator holds the join in their head. Concrete rot found during investigation (2026-06-20):

- `plans-manifest.yaml` covers 38 of 81 plans — stale and partial.
- Two status vocabularies: plan files use `Todo / In progress / Done`; the manifest uses `draft / in-progress / implemented`.
- Reviews carry no resolution state — "reviewed, all fixed" is indistinguishable from "reviewed, 4 bugs still open".
- ~15 branches merged into `main` are never pruned (local + origin); bare-name branches duplicate `agent/*` ones.
- Worktree/branch/plan names drift (worktree `document-links/` runs branch `agent/obsidian-comments`; plans `document-links.md` and `actual-document-links` both exist).
- No recorded branch→plan link, so the drift above is un-inferrable from any single name.

Design decisions already taken with the developer:

- **Generated, git-aware** — not hand-maintained (manual indexes rot; the manifest proved it).
- **Generated fresh, gitignored** — never committed, so it never forks per-branch or causes merge conflicts. Git is read live for branch/worktree/merge state. Mirrors how `references/CODEBASE_SNAPSHOT.md` is already gitignored + generated.
- **The plan is the spine** — the unit of work. One lifecycle vocabulary replaces both existing ones.

---

## Tasks

### Phase 0 — Agree the model (no code)

- [ ] Confirm the single lifecycle vocabulary. Proposed: `idea → planned → building → in-review → fixes-pending → merged → done` (+ `abandoned`). Decide exact set and names with the developer.
- [ ] Confirm plan frontmatter shape: add `branch:` and a normalized `status:` drawn from the vocabulary above; keep `Specs:`. Decide whether to keep the human-readable `**Status**:` line in sync or replace it.
- [ ] Confirm review-resolution shape: per-finding checkboxes (machine-countable) vs. a single `**Resolution**:` header. Recommendation: per-finding checkboxes so the board can count open findings.
- [ ] Decide whether this warrants a `specifications/workflow.md` spec or stays plan-documented. If yes, write the spec stub before Phase 2.

### Phase 1 — Branch (always first)

- [ ] Create branch `agent/work-tracking-board` from the plan title.

### Phase 2 — Normalize the data the board reads

- [ ] Define one lifecycle vocabulary in a single shared constant (consumed by the board script and documented in the plan template).
- [ ] Update `references/plans/_template.md`: add `branch:` and normalized `status:` frontmatter; document the vocabulary.
- [ ] Backfill `branch:` and normalized `status:` across existing plans. Use a Haiku-class subagent (same pattern as the `plans-manifest` skill) to propose values; developer spot-checks. Do NOT do this in main context.
- [ ] Update `references/reviews/_template.md`: add per-finding checkbox convention + a top-level unresolved-count expectation.
- [ ] Decide the fate of `plans-manifest.yaml`: either retire it (board supersedes it) or regenerate it from the board's join. Flag to developer — retiring removes a stale surface.

### Phase 3 — The board generator

- [ ] Add `scripts/board.ts` (bun, TS, matching `scripts/rewrite-imports.ts` style). Pure read; writes only `references/STATUS.md`.
- [ ] Parse every `references/plans/*.md`: title, `status`, `branch`, `spec`, tasks `N/M` complete.
- [ ] Read live git per plan branch: exists? merged into `main`? has a worktree? commits ahead/behind `main`, last-commit age. Use `git for-each-ref`, `git branch --merged`, `git worktree list`, `git rev-list --count`.
- [ ] Read reviews: locate the latest review file per plan (by name stem); count unresolved findings (unchecked boxes).
- [ ] Read specs referenced by each plan: spec `Status` + whether the plan appears in the spec's `Shipped` log.
- [ ] Render `references/STATUS.md`: grouped by lifecycle stage, one row per plan with stage, tasks N/M, branch state, open-review-findings count, spec state. Surface a top "needs your attention" section (in-review with open findings; merged-but-not-pruned; building with stale last-commit).
- [ ] Add `references/STATUS.md` to `.gitignore` (under the `# Maskor` block next to `CODEBASE_SNAPSHOT.md`).
- [ ] Add `"board": "bun run scripts/board.ts"` to root `package.json` scripts.

### Phase 4 — Hygiene mode

- [ ] `bun run board --prune`: list branches merged into `main` (local + origin) with the exact `git branch -d` / `git push origin --delete` commands, but do NOT delete automatically — print for developer approval.
- [ ] Flag worktree/branch/plan name mismatches and orphaned worktrees (worktree whose branch has no matching plan, or vice versa).
- [ ] Document the one naming rule in the plan template: branch = `agent/<plan-filename-stem>`, worktree dir = same stem.

### Phase 5 — Idea inboxes (lightest touch)

- [ ] Board shows a single "inbox" count summarizing open items across `references/TODO.md`, `specifications/_drafts.md`, and `tasks/*.md`. Do NOT consolidate the inboxes themselves — that is a separate decision flagged to the developer.

### Phase 6 — Close out

- [ ] Run `bun run format` then `bun run verify`.
- [ ] `git commit` per phase as work lands; final commit closes the batch.
- [ ] Set this plan's `Status` to `Done`. If a `specifications/workflow.md` was created, update its `Shipped` log.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specific to this plan:

- The board generator is pure parsing + git reads — test the parsers (plan frontmatter, task counts, review unchecked-box counts) against fixtures. Mock or stub git output for the git-state join so tests are deterministic.
- No test should depend on the live repo's branch state.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Open question for Phase 0: the board is gitignored and generated from the *current* branch's `references/plans/`. When run from a feature worktree, it sees that branch's plan edits, not main's. Decide whether `board` should always read plans from `main` (via `git show main:...`) or from the working tree. Recommendation: read from the working tree but label which branch it was generated on, so the orchestrator knows the vantage point.
