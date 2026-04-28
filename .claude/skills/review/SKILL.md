---
name: review
description: Use this skill when the user asks to "review" code, a feature, or a set of changes. Triggers on phrases like "review this", "do a code review", "review the changes", or "review <feature>".
---

# Maskor Code Review

This skill governs how code reviews are written in the maskor project.

## Rules

- Review only what changed — scope to the diff, plan, or area the user specifies.
- Be direct. Flag real issues clearly; don't soften bugs into suggestions.
- Separate bugs (broken behavior) from design issues (structural problems) from minor notes.
- If something looks wrong but is actually intentional or correct, put it in Non-issues with a brief explanation.
- Do not suggest refactors or new features beyond what the review scope warrants.

## Output

1. Write the full review to `references/reviews/<topic>-<YYYY-MM-DD>.md` using the template at `references/reviews/_template.md`.
2. Echo a short summary to stdout: overall verdict + count of bugs found. No fluff.

## Naming the file

Use kebab-case derived from the feature or area being reviewed, followed by the date.

Examples:

- "review the fragment editor" → `fragment-editor-2026-04-28.md`
- "review the watcher changes" → `watcher-2026-04-28.md`

## How to review

1. Read the relevant diff (`git diff`) or changed files.
2. Read the plan (`references/plans/`) and spec (`specifications/`) if they exist — check implementation against intent.
3. Fill in each section of the template. Remove sections that have nothing to report (replace with "None.").
4. Number items globally across sections so they stay referenceable.
