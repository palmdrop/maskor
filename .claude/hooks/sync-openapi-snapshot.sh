#!/usr/bin/env bash
# Stop / SubagentStop hook: keeps the committed OpenAPI snapshot + generated
# orval client in sync with the API route definitions by regenerating them when
# an agent finishes, and surfaces the result so it gets committed.
#
# Why this exists: the snapshot (packages/frontend/src/api/openapi.json) and the
# orval client (packages/frontend/src/api/generated/) are derived artifacts that
# must be rebuilt with `bun run codegen` whenever a route or its
# request/response schema changes. That manual step is routinely forgotten, so
# the generated layer silently drifts until `bun run verify` catches it — if
# verify is even run. codegen is fast (~1s, no server), so this hook just runs
# it. A content fingerprint taken before/after tells us whether codegen actually
# changed anything, so legitimately-uncommitted work in progress is not flagged
# unless a regeneration was genuinely missing.
#
# Contract: exit 0 lets the stop proceed; exit 2 blocks it and feeds stderr back
# to the agent. See packages/api/CLAUDE.md (OpenAPI snapshot section) and
# references/suggestions.md (recurring "stale openapi.json" entries).
set -uo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
snapshot="packages/frontend/src/api/openapi.json"
generated_dir="packages/frontend/src/api/generated"

# Content fingerprint of the generated artifacts. git hash-object is content-
# based and always available; comparing before vs after isolates "this run
# regenerated something" from "the working tree was already dirty".
fingerprint() {
  {
    git -C "$project_dir" hash-object "$snapshot" 2>/dev/null
    find "$project_dir/$generated_dir" -type f -print0 2>/dev/null \
      | sort -z \
      | xargs -0 git -C "$project_dir" hash-object 2>/dev/null
  }
}

before=$(fingerprint)

if ! output=$(cd "$project_dir" && bun run codegen 2>&1); then
  {
    echo "\`bun run codegen\` failed while regenerating the OpenAPI snapshot/client."
    echo "Fix the error below (usually a broken route or schema), then re-run \`bun run codegen\`."
    echo "--- codegen output ---"
    echo "$output"
  } >&2
  exit 2
fi

after=$(fingerprint)

if [ "$before" = "$after" ]; then
  exit 0
fi

# codegen regenerated stale output — a `bun run codegen` had been missed.
{
  echo "Regenerated the OpenAPI snapshot + orval client to match the current route definitions"
  echo "(a \`bun run codegen\` was missing, so the generated layer was stale)."
  echo "These files are now updated in your working tree — include them in your change set / commit:"
  echo "  - $snapshot"
  echo "  - $generated_dir/"
  echo "Nothing else to do; stopping again will pass now that they are in place."
} >&2
exit 2
