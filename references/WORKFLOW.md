# Workflow & the work board

How in-flight work is tracked across plans, branches, worktrees, reviews, and specs.

## The unit of work is a plan

One file in `references/plans/<stem>.md` per piece of work. By convention its branch
is `agent/<stem>` and, if worktree'd, the worktree directory is also `<stem>`. The
plan links to its spec(s) via the `**Specs**:` line; reviews link back to the plan
via their `**Plan**:` line. That naming is the spine the board joins on.

## The board is the cockpit

```
bun run board            # regenerate references/STATUS.md (gitignored)
bun run board --stdout   # print the markdown without writing the file
bun run board --json     # the joined model as JSON, for an agent orchestrator
bun run board --prune    # actionable branch/worktree hygiene (deletes nothing)
```

`references/STATUS.md` is **generated, never edited, never committed**. Regenerate it
whenever you want the current picture. It reads:

- **plans** — from the union of *every worktree on disk* (main is itself a worktree),
  deduped by stem, flagging content that diverges between worktrees.
- **git** — the source of truth for branch existence, merge state, worktree
  attachment, ahead/behind counts, and last-commit age (stale after 14 days).
- **reviews** — the latest review per plan, and how many findings are still open.
- **specs** — each referenced spec's status and whether its `**Shipped**:` log
  already names the plan.

The board leads with a **Needs attention** section: open review findings, branches
idle too long, plans marked Done whose branch never merged, plans In progress with
no branch, and plan content that diverges across worktrees.

## Lifecycle vocabulary (one, not three)

`idea → planned → building → in-review → fixes-pending → merged → done` (+ `abandoned`)

The board **infers** the stage from git reality plus the plan's `**Status**:` line,
so you normally write nothing extra. Git wins over claims: a plan marked Done whose
branch never merged surfaces as `building`, flagged. Override only to correct a wrong
inference, with a `**Lifecycle**:` line in the plan (see the plan template).

## Reviews track their own resolution

A review's `**Status**:` is `Open | Partially addressed | Resolved`. Add a numbered
`## Resolution` section as findings are fixed and flip the status. Until then the
board counts the findings as open, so reviewed-but-unfixed work stays visible. Legacy
reviews with no markers are assumed resolved once their work has merged.

## Hygiene

`bun run board --prune` lists merged local/remote branches with the exact delete
commands (it never runs them), plus worktree/branch/plan name mismatches and orphan
worktrees. Prune merged branches regularly — they are pure noise otherwise.

## Retired

The old `references/plans-manifest.yaml` and its generator skill are gone. The board
regenerates the same rollup live, so there is no static file to drift.
