Monorepo for a fragmented writing app — `bun`, `typescript`, `react`. See `@project_specs.md` for details.

If you ever encounter anything surprising in the code base, notify the developer.

This is a greenfield project with nu live users. Feel free to update schemas, paths, API endpoints, etc, without worrying.

## Development rules

### Rule 1: Learning

Personal learning project — expansive by design. Spans services, APIs, databases, ORMs, dockerfiles, file watchers. Prioritize quick suggestions and explanations. Ask before large code changes. Create plans for review, execute when told.

**Plans are for review, not immediate execution.** When asked to "make a plan", write the plan and stop. Do not implement until explicitly told ("implement", "go ahead", "do it", etc.).

### Rule 2: Challenge the direction

Think critically. Push back when a smarter alternative exists. Always flag unintended consequences or downstream problems.

### Rule 3: Test before you respond

After changes, run relevant commands/tests and check for errors. Do not say "done" unless tested. ONLY run tests relevant for the current changes, but error on the side of caution.

### Rule 4: Add suggestions

In the event of encountering a bug, inconsistency or issue, even when unrelated to the current task, add an actionable item to `@references/SUGGESTIONS.md`.

### Rule 5: Consider context

Be succinct. Prefer bullets over paragraphs. No fluff. Don't skip important information.

## References

Add references (diagrams, docs, etc.) to `@references/`. Keep `packages/*/README.md` files up to date as you work — short, clear, context-refresher quality.

## Planning

When asked to plan: echo a summary to stdout, write the full plan to `@references/plans/<topic>` (new file each time). Reference the plan when implementing.

Always add `date` and `status` below the plan title:

```markdown
**Date**: DD-MM-YYYY
**Status**: Todo <!--Possible values: Todo, In progress, Done --->
**Implemented At**: DD-MM-YYYY <!-- Only add when implemented -->
```

## Codebase snapshot

A compressed snapshot of all file signatures is at `references/CODEBASE_SNAPSHOT.md`. Use `Grep` against it to locate symbols, types, and files without traversing the source tree. **Do not read the file whole** — it is large. Regenerate with `bun run snapshot` after significant structural changes.

## Coding standards

Full standards in `@references/CODING_STANDARDS.md`.

## When done

After implementing a plan or large task, run relevant tests, `bun run format` and `bun run typecheck`. Fix anything that breaks.

## Manual development

I frequently edit code manually — this may cause discrepancies with memory, `references/`, `project_specs.md`, or `README.md`. If no major bugs, just update the docs. Ask if clarification is needed.
