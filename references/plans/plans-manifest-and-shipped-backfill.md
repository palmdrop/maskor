# Plans manifest and Shipped backfill

**Date**: 14-05-2026
**Status**: In Progress
**Closed**:

---

## Goal

> Produce a reusable, machine-readable manifest of every file under `references/plans/`, then use it to backfill the `**Shipped**:` list in each user-nominated spec — at the lowest possible expensive-model token cost.

---

## Tasks

### Phase 1 — Build the plans manifest

This phase is operationalized as the `plans-manifest` skill (`.claude/skills/plans-manifest/`). Schema, Haiku prompt, and invocation steps live there.

- [x] Invoke the `plans-manifest` skill. It spawns a Haiku-class subagent that writes `references/plans-manifest.yaml`.
- [x] Review the manifest manually. Spot-check ~5 entries against their source plans. Fix obviously wrong statuses and missing `related_specs` links.
- [x] Review the `# Orphans` block at the bottom of the manifest — plans with `related_specs: []`. Either infra/tooling work (fine, leave as orphan) or evidence of a missing spec entry (act accordingly).
- [x] Commit the manifest. It is now a durable repo artifact, regenerated via the skill when plans land or change.

### Phase 2 — Per-spec Shipped backfill (expensive model, on demand)

- [x] Agree on the invocation pattern: user passes a spec path (or list of paths) via `PROMPT.md`. Agent does the rest.
- [x] For each nominated spec, agent:
  1. Reads the spec body.
  2. Greps the `references/plans-manifest.yaml` for entries whose `related_specs` contains this spec.
  3. For each matched plan, drafts one or more `**Shipped**` bullets in the spec's header format:
     `- YYYY-MM-DD — <shipped_what>. (plan: scripts/ralph/archive/YYYY-MM-DD-<feature-name>/)` for ralph-era work, or `(plan: references/plans/<plan>.md)` for pre-ralph plans.
     > Write at the **capability level**: what the user or system can now do. Omit implementation details (library names, DB schemas, endpoint paths, timing constants, internal patterns) — those belong in the plan or code.
     > Some plans include multiple phases or large features. Likewise, some specs include many moving parts. Create multiple "Shipped" entries if the plan warrants it. Merge entries where the distinction is purely internal.
  4. Only when the manifest entry is ambiguous (vague `shipped_what`, status `in-progress`, missing date) does the agent open the underlying plan file.
  5. Surfaces the proposed bullets in chat for review before writing.
- [x] User reviews, accepts/edits, and the agent commits the spec updates.

### Phase 3 — Maintenance

- [ ] Document in the relevant skill (or in `CLAUDE.md`) when to regenerate the manifest: after any new plan lands, or after a plan changes status.
- [ ] Decide whether the manifest should be regenerated incrementally (only changed plans) or in full each time. Full-regen is simpler; incremental is cheaper. Default to full until volume justifies otherwise.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

> This plan describes a process, not code. No tests apply — the review checkpoints (manifest spot-check, per-spec review) are the verification.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.

> Token math reminder (rough): without manifest, ~30k expensive-model lines across ~15 specs. With manifest, ~4k expensive-model lines + a one-time ~12k cheap-model pass. Net ~8x reduction on expensive context, plus the manifest is reusable.

> Key design choice: pay once with a cheap model, then operate on the digest. Do not have the expensive model build the manifest — that defeats the purpose.

> Key risk: manifest accuracy. The whole flow is poisoned if statuses are wrong. The Phase 1 review checkpoint is non-optional.
