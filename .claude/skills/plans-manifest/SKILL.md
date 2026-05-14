---
name: plans-manifest
description: "Regenerate references/plans-manifest.yaml by parsing every file in references/plans/ with a cheap model. Run on demand — rarely, only after new plans land or statuses change. Triggers on: regenerate plans manifest, rebuild plans manifest, update plans manifest, plans manifest."
user-invocable: true
---

# Plans Manifest Generator

Builds a token-efficient manifest of all plans in `references/plans/`. The manifest is the input to per-spec `**Shipped**:` backfill — see `references/plans/plans-manifest-and-shipped-backfill.md` for the broader flow.

---

## The Job

1. Read the prompt at `.claude/skills/plans-manifest/prompt.md`.
2. Spawn a Haiku-class subagent (use the `Agent` tool with `subagent_type: "general-purpose"` and `model: "haiku"`), passing the prompt file's contents inline as the agent's `prompt` parameter.
3. The subagent writes `references/plans-manifest.yaml` and reports a short summary on completion.
4. Surface the subagent's summary to the user. Do NOT re-read the manifest yourself unless the user explicitly asks — that defeats the point of the skill.
5. Recommend the user spot-check ~5 entries before relying on the manifest.

**Important:** Do not build the manifest in the main conversation. The whole reason this skill exists is that the cheap model does the heavy lifting. If Haiku is unavailable, ask the user which fallback model to use before proceeding.

---

## When to invoke

- On demand when the user asks to regenerate.

---

## Output

`references/plans-manifest.yaml` is overwritten in place. The previous version is not preserved — git history is the audit trail.

---

## Checklist

Before reporting completion to the user:

- [ ] Spawned a Haiku-class subagent (did NOT build the manifest in main context)
- [ ] Subagent wrote `references/plans-manifest.yaml`
- [ ] Surfaced the subagent's summary to the user
- [ ] Recommended a manual spot-check of ~5 entries
