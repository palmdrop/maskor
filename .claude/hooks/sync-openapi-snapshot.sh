#!/usr/bin/env bash
# Stop / SubagentStop hook: keeps the committed OpenAPI snapshot in sync with the
# API route definitions by regenerating it when an agent finishes, and surfaces
# the result so it gets committed.
#
# Why this exists: the snapshot (packages/frontend/src/api/openapi.json) is a
# tracked, derived artifact that must be rebuilt with `bun run codegen` whenever
# a route or its request/response schema changes. That manual step is routinely
# forgotten, so the snapshot silently drifts until `bun run verify` catches it —
# if verify is even run. codegen is fast (~1s, no server), so this hook just runs
# it, then checks whether the snapshot is left uncommitted.
#
# Scope note: `bun run codegen` also rebuilds the orval client under
# packages/frontend/src/api/generated/, but that directory is .gitignored and
# rebuilt in CI before typecheck — it is never committed. The ONLY committable
# artifact, and therefore the only thing this hook tracks, is openapi.json.
#
# The decision signal is the *committed* state, not whether codegen touched any
# bytes: after regenerating, ask git whether the snapshot has anything to commit.
# If codegen reproduces exactly what is already committed (the common case — and
# what happens when it self-heals a transient working-tree state, e.g. right
# after a rebase), there is nothing to commit, so the stop proceeds silently.
# Only a genuine drift — a regenerated snapshot that differs from the committed
# one — blocks and is surfaced for commit.
#
# Contract: exit 0 lets the stop proceed; exit 2 blocks it and feeds stderr back
# to the agent. See packages/api/CLAUDE.md (OpenAPI snapshot section) and
# references/suggestions.md (recurring "stale openapi.json" entries).
set -uo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
snapshot="packages/frontend/src/api/openapi.json"

if ! output=$(cd "$project_dir" && bun run codegen 2>&1); then
  {
    echo "\`bun run codegen\` failed while regenerating the OpenAPI snapshot/client."
    echo "Fix the error below (usually a broken route or schema), then re-run \`bun run codegen\`."
    echo "--- codegen output ---"
    echo "$output"
  } >&2
  exit 2
fi

# Source of truth: does the regenerated snapshot differ from what's committed?
# --porcelain reports staged and unstaged changes to the tracked snapshot; empty
# output means there is nothing to commit, so it is in sync. (generated/ is
# .gitignored and intentionally not consulted here.)
pending=$(git -C "$project_dir" status --porcelain -- "$snapshot")

if [ -z "$pending" ]; then
  exit 0
fi

# Real drift: the regenerated snapshot differs from the committed one — a
# `bun run codegen` had been missed.
{
  echo "Regenerated the OpenAPI snapshot to match the current route definitions"
  echo "(a \`bun run codegen\` was missing, so the snapshot was stale)."
  echo "It now differs from what's committed — include it in your change set / commit:"
  echo "$pending" | sed 's/^/  /'
  echo "Nothing else to do; stopping again will pass once it is committed."
} >&2
exit 2
