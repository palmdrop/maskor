# Repo cleanup and board hardening

**Date**: 21-06-2026
**Status**: In progress
**Branch**: agent/repo-cleanup-and-board-hardening
**Specs**: <!-- none; workflow tooling, documented in references/WORKFLOW.md -->
**Closed**:

---

## Progress (2026-06-23)

Phases 0–5 done (board hardening + docs + 4 shipped plans marked Done), `bun run verify`
green. Local prune executed with developer approval: **46 → 19 local branches** (20
merge-confirmed + 7 verify-confirmed-shipped + `obsidian-comments` dropped/abandoned).
Two safety bundles written to the repo root.

Second prune pass (developer approved "delete all but this branch + main"): deleted the
remaining 15 working branches after confirming or accepting bundle-recoverability —
`actual-document-links` confirmed byte-identical to main (document-links shipped),
`editor-flicker` confirmed (flicker fix + margin refactor in main; only an unadopted
ProseEditor split left behind), `scroll-issue` superseded (ADR-0013 overlay), the rest
stale and bundle-backed. **Kept the two `backup/main-pre-rewrite*` branches** (deliberate
full-rewrite safety nets — pushed back on deleting these).

Final local branches: `main`, `agent/repo-cleanup-and-board-hardening`, `backup/main-pre-rewrite{,-2}`.

Remaining (handed to developer):

- Merge `agent/repo-cleanup-and-board-hardening` → main (carries board, hardening, docs,
  status updates), then remove the `manual-todos` worktree and delete this branch.
- Delete the 20 merged **remote** branches (`bun run board --prune`) — needs network.

---

## Goal

> Two outcomes, in order. (1) Harden `bun run board` so it detects squash-merged
> branches and never produces a destructive false positive — confirmed-merged
> branches are listed as prunable, everything it cannot confirm is listed as
> "verify, do not auto-prune". (2) Using that hardened classifier, bring the repo
> to a clean state: every plan's status reflects reality, every merged branch and
> stale worktree is pruned, genuinely-unmerged work is either merged or explicitly
> abandoned, and `references/STATUS.md` shows zero spurious flags.

Done = `bun run board` shows only genuinely in-flight work flagged; `git branch`
lists only `main`, active work, intentional backups, and unmerged-but-tracked work.

---

## Why this is needed (investigation findings, 2026-06-21)

The board flagged 13 plans. Investigation (feature presence in `main` via `git grep`
+ commit-subject comparison) showed:

- **12 of 13 are shipped**; they flag only because the workflow **squash-merges**,
  which `git branch --merged` cannot detect. Squash-merged-then-deleted branches
  leave their plan looking "in progress, no branch"; squash-merged-but-kept branches
  flag "Done but branch not merged" forever.
- **1 is genuinely unmerged**: `obsidian-comments` (the `%%…%%` feature) exists only
  on `agent/obsidian-comments` (the `document-links` worktree); its plan there is
  marked **Done** but the code is absent from `main`. Mismarked in the dangerous
  direction.
- The repo has **~29 non-ancestor local branches** total — most are squash-merged
  shipped features never pruned (`agent/export`, `agent/focus-mode`, `agent/inline-editing`,
  `agent/toast-errors`, `agent/cache-issues`, `agent/editor-flicker`, `agent/scroll-issue`,
  `agent/suggestion-fixes`, `agent/better-navigation`, …) plus intentional backups
  and a few unknowns. Hand-picking is not viable; the board must classify them.

### Why not a naive content-diff for squash detection

`git diff main...<branch>` being empty is brittle: once `main` edits the same area
after the squash, the diff is non-empty even though the feature merged. So content
detection is **best-effort only** and is allowed to fail *safe* (downgrade to
"verify"), never to mark something prunable that isn't. The authoritative signal is
an explicit `**Merged**: <sha>` provenance line recorded at merge time.

---

## Tasks

### Phase 0 — Safety net (do first; redo immediately before Phase 7)

The single highest-leverage protection: snapshot every ref so no recovery depends
on reflog timing (unreachable commits are GC-eligible after ~30 days). Cheap, fast,
non-destructive.

- [ ] Bundle all refs to a file **outside** the repo:
      `git bundle create ../maskor-branches-$(date +%Y%m%d-%H%M).bundle --all`
- [ ] Verify the bundle is readable and lists the at-risk branches:
      `git bundle verify ../maskor-branches-*.bundle` and
      `git bundle list-heads ../maskor-branches-*.bundle | grep -E 'obsidian-comments|actual-document-links|todos'`
- [ ] **Re-run the bundle immediately before any deletion in Phase 7** (state will have
      moved since the first bundle). Keep both bundles until the cleanup is confirmed good.
- [ ] Recovery, if ever needed: `git fetch ../maskor-branches-<stamp>.bundle <branch>:<branch>`.

### Phase 1 — Branch

- [ ] Create branch `agent/repo-cleanup-and-board-hardening` from this plan title.

### Phase 2 — Harden the board (code)

Add a layered, non-destructive merge-confirmation signal. Files under `scripts/board/`.

- [ ] `types.ts`: add `mergeConfirmation: "ancestor" | "provenance" | "squash" | "unconfirmed"`
      to `BranchState`; add `declaredMergeSha: string | null` to `PlanRecord`.
- [ ] `parse.ts`: parse a `**Merged**:` bold-line (a commit SHA or `#PR`) into `declaredMergeSha`.
- [ ] `git.ts`: add `confirmMerge(branch, repoRoot, declaredMergeSha)` implementing the
      ladder below; set it on `BranchState`. Keep it pure-ish (thin git wrappers, no I/O
      beyond git) so the ladder logic can be unit-tested with injected results.
- [ ] `lifecycle.ts`: replace the blunt `"plan marked Done but branch not merged"`
      attention with confirmation-aware logic:
  - `merged via ancestor/provenance/squash` + plan Done → stage `done`, **no flag**.
  - `merged` + plan not Done → stage `merged`, flag "branch merged — mark plan Done & prune".
  - `unconfirmed` + plan Done + branch exists → stage `done`, flag **"merge unconfirmed — verify before pruning"** (catches `obsidian-comments` and brittle false-negatives, both safe).
  - `unconfirmed` + branch exists + plan not Done + ahead of main → genuine `building`/`in-review`/`fixes-pending` (unchanged).
- [ ] `main.ts` (`buildHygiene`): split the single prunable list into:
  - **prunable** — `mergeConfirmation !== "unconfirmed"`, not worktree-attached, not `backup/*`, not `main`.
  - **verify** — `unconfirmed` + plan Done (do not auto-suggest deletion).
  - Leave `backup/*` and any branch with no plan and no confirmation untouched.
- [ ] `render.ts` (`renderPrune`): add a "Verify before pruning (unconfirmed)" section
      and a "Worktrees" section (remove command per stale worktree); keep "Nothing was deleted."
- [ ] Tests: `git.test.ts` for the `confirmMerge` ladder (ancestor, provenance hit/miss,
      squash hit/miss, unconfirmed) with injected git results; `lifecycle.test.ts` for the
      four new stage/flag branches; `render.test.ts` for the new prune sections.
- [ ] Commit Phase 2.

The confirmation ladder (`confirmMerge`), evaluated in order — first hit wins:

```sh
# 1. ancestor (definitive): normal merge / fast-forward
git merge-base --is-ancestor "$branch" main   # exit 0 → "ancestor"

# 2. provenance (definitive): plan **Merged**: <sha>, sha reachable from main
git merge-base --is-ancestor "$declaredMergeSha" main   # exit 0 → "provenance"

# 3. squash patch-equivalence (best-effort): is the branch's COMBINED diff in main?
MB=$(git merge-base main "$branch")
SQUASH=$(git commit-tree "$(git rev-parse "$branch^{tree}")" -p "$MB" -m _)
git cherry main "$SQUASH"            # a line starting with "-" → "squash"

# 4. otherwise → "unconfirmed"
```

Brittleness note: step 3 yields a false **negative** (→ "unconfirmed") when `main`
edited the same lines after the squash. That only downgrades the branch to the
"verify" list — never to a wrongful prune. Recording `**Merged**: <sha>` once at
merge time makes step 2 fire and pins the result permanently.

### Phase 3 — Workflow conventions (docs)

- [ ] `references/plans/_template.md`: add an optional `**Merged**: <sha>` line; document
      that it is the authoritative merge record when squash detection can't confirm.
- [ ] `references/WORKFLOW.md`: document the merge ladder, and the post-merge ritual —
      on squash-merge, set the plan `**Status**: Done` + `**Closed**:` + `**Merged**: <sha>`,
      then delete the branch and its worktree. State that branches are pruned right after merge
      so the board stays clean.
- [ ] Commit Phase 3.

### Phase 4 — Classify (run the hardened board)

- [ ] `bun run board` then `bun run board --prune > /tmp/prune.txt`. Capture the three lists
      (prunable / verify / worktrees). These outputs — not the lists hand-compiled below —
      are authoritative at execution time; the lists in **Appendix A** are the 2026-06-21
      snapshot for review only.
- [ ] Eyeball every "verify" entry. Confirm each is either genuinely shipped (then record
      `**Merged**:` and move to prune) or genuinely unmerged (then handle in Phase 6/7).

### Phase 5 — Fix stale plan statuses

- [ ] Set `**Status**: Done`, add `**Closed**:`, and (where the squash commit is known)
      `**Merged**: <sha>` on the plans confirmed shipped but mismarked:
  - `action-log` — In Progress → Done (first verify its 2 open tasks of 31 are truly minor; drop or keep with note).
  - `entity-editor-unification` — "Phase 6 remaining" → Done (Phase 6 test `entity-editor-shell.test.tsx` is in main).
  - `entity-subfolders` — In progress → Done.
  - `margin-flicker-and-refactor` — In progress → Done.
  - Plus any additional plan the Phase 4 run surfaces as merged-but-not-Done.
- [ ] For plans already marked Done whose branch is squash-merged (Appendix A.2), add
      `**Merged**: <sha>` so they never re-flag, then they become prune candidates.
- [ ] Commit Phase 5.

### Phase 6 — Resolve genuinely-unmerged work

This phase governs every branch the board could **not** confirm as merged. These hold
real, irrecoverable-after-GC work (snapshot: `agent/actual-document-links` **12 commits**
ahead, `agent/todos` **8 commits** ahead, `agent/obsidian-comments` **1 commit**, all with
no plan or a Done plan whose code is absent from main). The rule below is mandatory.

**Prune gate — a branch may move to the Phase 7 prune list ONLY if its work is proven to
already be in `main`.** No exceptions, no "looks shipped", no inference from the branch name.

- [ ] For each unconfirmed branch, run the explicit in-main confirmation and record the
      result in this plan before deciding:
  - Squash equivalence (authoritative when it fires): the Phase 2 ladder returns `squash`
    for the branch — i.e. its combined patch is already in main.
  - **AND** content spot-check: enumerate the branch's net new/changed source files
    (`git diff --name-only main...<branch> -- 'packages/**'`) and confirm each is present and
    semantically equivalent in main (`git grep`/`git show main:<file>` for the distinctive
    symbols the branch introduced). Empty or all-equivalent → confirmed-in-main.
  - Pass (both signals agree it is in main) → eligible for prune; record `**Merged**: <sha>`.
  - Fail or ambiguous → **keep** the branch; treat as in-flight or escalate the decision.
    A branch that is N commits ahead with no squash match and distinct files absent from main
    is unmerged work — it is NEVER pruned by this plan.
- [ ] **`obsidian-comments`** (explicit developer decision required — do not auto-resolve):
  - Keep: merge `agent/obsidian-comments` into `main` via the normal flow, bringing its plan +
    `specifications/obsidian-comments.md`; set `**Merged**:`; then prune in Phase 7.
  - Drop: set its plan `**Lifecycle**: abandoned` with a reason, confirm the Phase 0 bundle
    contains `agent/obsidian-comments`, then prune branch + `document-links` worktree in Phase 7.
- [ ] **`agent/actual-document-links` (12 ahead)** and **`agent/todos` (8 ahead)** — orphans
      with no plan. Apply the prune gate. If they fail it (expected — substantial unmerged work),
      they are KEPT; surface them to the developer as "unexplained in-flight work: keep, write a
      plan, or explicitly abandon" — do not delete on your own judgment.
- [ ] Apply the prune gate to `ralph/small-improvements` and the Appendix A.3 branches; only
      gate-passing branches join the prune list.
- [ ] Commit any plan/status changes from this phase. The output is an explicit, recorded
      prune list where every entry has a logged in-main confirmation.

### Phase 7 — Prune (destructive — only after Phases 4–6 confirm)

Preconditions: the Phase 6 prune list is finalized (every entry has a logged in-main
confirmation), and a **fresh Phase 0 bundle** was just created. Delete nothing outside that
gated list. Order matters: remove a worktree before deleting the branch it holds. Re-derive
from the board run; Appendix A is the review snapshot, not the authority.

- [ ] Re-create the safety bundle (Phase 0) — state has moved since the first one.
- [ ] Remove stale worktrees (merged or resolved): first `git -C <path> status --short` to
      confirm clean, then `git worktree remove <path>` (avoid `--force`; only use it on a
      worktree you have just confirmed holds nothing you want).
- [ ] `git worktree prune`.
- [ ] Delete **ancestor-merged** local branches with `git branch -d` (Appendix A.1).
- [ ] Delete **squash-confirmed** local branches with `git branch -D` (Appendix A.2) —
      `-D` is required because they are not ancestors; safe *only* because the board confirmed
      their content is in `main`.
- [ ] Delete **merged remote** branches with `git push origin --delete <name>` (Appendix A.4).
- [ ] Do **not** touch: `backup/main-pre-rewrite*`, `agent/work-tracking-board` (until merged),
      and anything still on the "verify" list.

### Phase 8 — Merge the board work and re-baseline

- [ ] Merge `agent/work-tracking-board` (the board feature, prior plan) into `main` if not yet
      merged; record its `**Merged**:`; prune its branch + the `manual-todos` worktree.
- [ ] Merge this cleanup branch into `main`.
- [ ] `bun run board` — confirm `STATUS.md` shows **zero** spurious flags (only genuine in-flight).
- [ ] `bun run board --prune` — confirm prunable + verify lists are empty (or only intended keeps).

### Phase 9 — Close out

- [ ] `bun run format` then `bun run verify`. Fix anything red.
- [ ] Final `git commit`.
- [ ] Set this plan `Status: Done`, `Closed:`, `Merged:`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specific to this plan:

- `confirmMerge` ladder: unit-test each rung with injected git command results (do not depend
  on live repo state). Cover ancestor-hit, provenance-hit, provenance-miss, squash-hit,
  squash-miss→unconfirmed.
- `deriveStage`: the four new confirmation-aware branches, especially the safe-by-default
  `unconfirmed + Done → done + "verify" flag` (the `obsidian-comments` shape).
- The git **operations** in Phases 6–8 are not unit-tested; they are gated behind the board's
  classification and manual confirmation, and are reversible up to branch deletion (hence the
  ancestor/squash-confirmation requirement before any `-D`).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed.

Phases 2–3 are code/docs and land first. Phases 4–9 are operational cleanup that depends on
the hardened board; do them in one focused session and regenerate the board between steps.

Open decision the developer must make in Phase 6: keep or drop `obsidian-comments`.

Once a phase is done, check off its tasks, `git commit`, and describe what changed. When the
plan is implemented, set its status, update `references/WORKFLOW.md` and the plan template, and
record `**Merged**:`.

---

## Appendix A — Branch/worktree snapshot (2026-06-21, review-only)

Re-derive from `bun run board --prune` at execution time; state drifts.

### A.0 Worktrees (`git worktree list`)

| worktree | branch | disposition |
| --- | --- | --- |
| `/home/palmdrop/repos/maskor` | `main` | keep |
| `.worktrees/manual-todos` | `agent/work-tracking-board` | keep until board work merged (Phase 8), then remove |
| `.worktrees/margins-overflow` | `agent/margins-overflow` | branch is ancestor-merged → remove worktree, delete branch |
| `.worktrees/document-links` | `agent/obsidian-comments` | holds UNMERGED work + name mismatch → resolve in Phase 6 before removing |
| `.worktrees/actual-document-links` | `agent/actual-document-links` | orphan, no plan → investigate (Phase 6) |
| `.worktrees/todos` | `agent/todos` | orphan, no plan → investigate (Phase 6) |

### A.1 Ancestor-merged locals — `git branch -d` (safe)

`agent/better-aspects`, `agent/document-links`, `agent/fragment-splitter`,
`agent/fragments-and-sequences`, `agent/frontend-component-refactors`,
`agent/frontend-refactor`, `agent/manual-todos`, `agent/margins-overflow`,
`agent/overview-redesign`, `agent/sequence-changes`, `agent/small-fixes`,
`aspect-preview-reader`, `margins`, `overview-redesign`, `place-in-sequence`,
`ralph/todo-triage-fixes`

### A.2 Squash-confirmed-shipped locals — `git branch -D` (after board confirms)

Confirmed in investigation: `import-sequence`, `dev-db-auto-reset`,
`preview-import-shared-renderer`, `agent/margins-2`, `agent/margins-3`,
`agent/margins-4`, `agent/margins-fixes`.

### A.3 Non-ancestor locals to classify via the board (likely squash-merged shipped)

`agent/better-navigation`, `agent/cache-issues`, `agent/editor-flicker`, `agent/export`,
`agent/focus-mode`, `agent/inline-editing`, `agent/margins-review`, `agent/scroll-issue`,
`agent/suggestion-fixes`, `agent/suggestion-fixes2`, `agent/toast-errors`,
`feat/sequence-rename-and-row-menu`, `fix/case-only-rename-keyed-entities`,
`fix/sequence-arrow-key-reorder`, `fragment-created-at`, `ralph/small-improvements`

### A.4 Merged remotes — `git push origin --delete <name>`

`agent/fragment-splitter`, `agent/fragments-and-sequences`,
`agent/frontend-component-refactors`, `agent/frontend-refactor`, `agent/margins-fixes`,
`agent/overview-redesign`, `agent/sequence-changes`, `agent/small-fixes`,
`aspect-preview-reader`, `dev-db-auto-reset`, `entity-subfolders`,
`feat/sequence-rename-and-row-menu`, `feature/action-log`, `feature/project-config`,
`margins`, `place-in-sequence`, `ralph/todo-triage-fixes`, `worktree-remove-piece-concept`

### A.5 Keep (do not prune)

`main`, `backup/main-pre-rewrite`, `backup/main-pre-rewrite-2`,
`agent/work-tracking-board` (until Phase 8), `agent/obsidian-comments` (until Phase 6 decision).
