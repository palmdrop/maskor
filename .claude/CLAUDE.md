Monorepo for a fragmented writing app — `bun`, `typescript`, `react`, Obsidian as temp backend. See `@project_specs.md` for details.

Stack: bun, typescript, storage, file watcher, processing queue (redis?), fragment API, import manager (Word files), sequencer, shared package. Technologies not fully settled — suggest better options where applicable.

## Development rules

### Rule 1: Learning

Personal learning project — expansive by design. Spans services, APIs, databases, ORMs, dockerfiles, file watchers. Prioritize quick suggestions and explanations. Ask before large code changes. Create plans for review, execute when told.

**Plans are for review, not immediate execution.** When asked to "make a plan", write the plan and stop. Do not implement until explicitly told ("implement", "go ahead", "do it", etc.).

### Rule 2: Challenge the direction

Think critically. Push back when a smarter alternative exists. Always flag unintended consequences or downstream problems.

### Rule 3: Test before you respond

After changes, run relevant commands/tests and check for errors. Do not say "done" unless tested.

### Rule 4: Add suggestions

After every major change, add/remove/update an actionable item in `@references/SUGGESTIONS.md`. Be specific — point to files, errors, or issues that can be observed directly.

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

## Coding standards

Full standards in `@references/CODING_STANDARDS.md`. Key rules:

- No abbreviated names — `f` → `file`, `dir` → `directory`, `fm` → `frontmatter`. Exceptions: `id`, `uuid`, `acc`, single-letter iterators.
- Spread syntax over manual property mapping. Exclude with destructuring: `const { c: _, ...rest } = original`.
- Regex constants end in `_REGEX`.
- Explicit braces on all `if` bodies. Explicit `return` in multi-line arrow functions.
- Prefer `reduce` over `for...of` when accumulating into an object.
- No redundant intermediate type casts (`as string as T` → `as T`).
- Descriptive fallback identifiers — not `"Untitled"`.
- Mark known limitations with `// TODO:` and a reason.

## When done

After implementing a plan or large task, run `bun run test`, `bun run format`, `bun run typecheck`. Fix anything that breaks.

## Manual development

I frequently edit code manually — this may cause discrepancies with memory, `references/`, `project_specs.md`, or `README.md`. If no major bugs, just update the docs. Ask if clarification is needed.
