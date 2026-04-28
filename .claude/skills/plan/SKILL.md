---
name: plan
description: Use this skill when the user asks to "plan", "make a plan", "create a plan", or "write a plan" for any feature, task, or topic in the maskor project. This skill must be used for any planning request — even if the user's phrasing is informal ("let's plan X", "how should we approach X?", "think through X"). Always invoke this skill before writing any plan.
---

# Maskor Plan

This skill governs how plans are written in the maskor project.

## Rules

- Write the plan file. Stop. Do not implement anything.
- Never say "done" or imply readiness to proceed. The plan is for review.
- Wait for the user to explicitly instruct you to implement ("go ahead", "do it", "implement", etc.).

## Output

1. Write the full plan to `references/plans/<topic>.md` using the template below.
2. Echo a short summary to stdout (bullet form, ≤5 lines): goal + phases only. No fluff.

## Plan file format

```markdown
# <Title>

**Date**: DD-MM-YYYY
**Status**: Todo

---

## Goal

> One sentence: what this plan achieves and why.

---

## Naming the file

Use kebab-case derived from the topic. Examples:

- "plan the fragment editor" → `fragment-editor.md`
- "plan the import pipeline refactor" → `import-pipeline-refactor.md`

If a file with that name already exists, read it first and ask the user whether to overwrite or create a new versioned file (e.g. `fragment-editor-2.md`).

## Phases

Break work into logical, sequential phases. Each phase should be independently reviewable. Typical phase structure:

- **Phase 1**: Schema / data model changes
- **Phase 2**: Backend / API changes
- **Phase 3**: Frontend changes
- **Phase 4**: Tests and cleanup

Adapt as needed — not every plan needs all four. A pure refactor might be two phases; a new feature might be five. Use judgment.

Each phase should contain concrete steps and changes to be implemented.

## What NOT to include

- Implementation code or pseudocode
- Speculative futures ("could later be extended to...")
- Anything that belongs in a spec (`specifications/`) — reference the spec instead
```
